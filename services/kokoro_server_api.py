import os
import sys
import io
import re
import json
import numpy as np
import soundfile as sf
import uvicorn
from fastapi import FastAPI, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

sys.path.append(os.path.join(os.path.dirname(__file__), 'src'))

# Import các hàm phụ trợ từ package kokoro_vietnamese và vig2p
from kokoro_vietnamese import split_text, merge_audio_chunks, normalize_audio
from kokoro_vietnamese.core import _download_or_resolve, DEFAULT_HF_REPO_ID, DEFAULT_ONNX_FILE, DEFAULT_CONFIG_FILE, DEFAULT_VOICE
from vig2p.core import tokenize_text, WORD_RE, _backend_output_to_text, create_backend, fix_phonemes

_backend = create_backend()

# BẢNG TỪ ĐIỂN HIỆU CHỈNH ÂM TIẾT TIẾNG VIỆT CHUẨN
# Khắc phục triệt để lỗi SEA-G2P nhận nhầm các từ tiếng Việt không dấu thành tiếng Anh/Pháp
VI_PHONEME_OVERRIDE = {
    'to': 'tˈɔ',       # Khắc phục triệt để lỗi "to lớn" đọc thành "tu lớn"
    'do': 'zˈɔ',       # "tự do", "lý do" đọc chuẩn âm 'do', không bị đọc thành 'du'
    'so': 'sˈɔ',       # "so sánh" không bị đọc thành 'sôu'
    'no': 'nˈɔ',       # "ăn no", "no ấm" không bị đọc thành 'nôu'
    'me': 'mˈɛ',       # "quả me", "me chua" không bị đọc thành 'mi'
    'be': 'bˈɛ',       # "be bé" không bị đọc thành 'bi'
    'he': 'hˈɛ',       # "he hé" không bị đọc thành 'hi'
    'le': 'lˈɛ',       # "le te", "le lói" không bị đọc thành 'lơ'
    'de': 'zˈɛ',       # "de dặt" không bị đọc thành 'dơ'
    'te': 'tˈɛ',       # "te te"
    'go': 'ɣˈɔ',       # "xe go"
    'an': 'aːn',       # "an nhiên", "bình an" phát âm chuẩn /a:n/
    'can': 'kˈaːn',    # "can ngăn"
    'ban': 'bˈaːn',    # "ban ngày", "uỷ ban"
    'tan': 'tˈaːn',    # "tan vỡ", "tan biến"
    'van': 'vˈaːn',    # "van xin"
    'man': 'mˈaːn',    # "man mác"
    'am': 'aːm',       # "am hiểu"
    'in': 'iːn',       # "in ấn"
    'on': 'ɔn',
}

# BỘ CHUYỂN ĐỔI SỐ VÀ VIẾT TẮT TIẾNG VIỆT
UNITS = ['không', 'một', 'hai', 'ba', 'bốn', 'năm', 'sáu', 'bảy', 'tám', 'chín']

def read_three_digits(n, is_highest=False):
    h = n // 100
    t = (n % 100) // 10
    u = n % 10
    res = []
    if h > 0 or not is_highest:
        res.append(UNITS[h] + ' trăm')
    if t > 1:
        res.append(UNITS[t] + ' mươi')
        if u == 1:
            res.append('mốt')
        elif u == 4:
            res.append('tư')
        elif u == 5:
            res.append('lăm')
        elif u > 0:
            res.append(UNITS[u])
    elif t == 1:
        res.append('mười')
        if u == 5:
            res.append('lăm')
        elif u > 0:
            res.append(UNITS[u])
    elif t == 0:
        if u > 0:
            if h > 0 or not is_highest:
                res.append('linh')
            res.append(UNITS[u])
    return ' '.join(res)

def number_to_vietnamese(num_str):
    try:
        n = int(num_str)
    except Exception:
        return num_str
    if n == 0:
        return 'không'
    scales = ['', 'nghìn', 'triệu', 'tỷ', 'nghìn tỷ', 'triệu tỷ']
    groups = []
    temp = n
    while temp > 0:
        groups.append(temp % 1000)
        temp //= 1000
    res = []
    for i in range(len(groups) - 1, -1, -1):
        g = groups[i]
        if g > 0:
            words = read_three_digits(g, is_highest=(i == len(groups) - 1))
            res.append(words)
            if scales[i]:
                res.append(scales[i])
    return ' '.join(res).strip()

def normalize_vietnamese_text(text):
    if not text:
        return ""
    s = text
    # Chuẩn hoá phần trăm
    s = re.sub(r'(\d+)\s*%', lambda m: number_to_vietnamese(m.group(1)) + ' phần trăm', s)
    # Tiền tệ, đơn vị viết tắt
    s = re.sub(r'(\d+)\s*k\b', lambda m: number_to_vietnamese(m.group(1)) + ' nghìn', s, flags=re.IGNORECASE)
    s = re.sub(r'(\d+)\s*tr\b', lambda m: number_to_vietnamese(m.group(1)) + ' triệu', s, flags=re.IGNORECASE)
    s = re.sub(r'(\d+)\s*đ\b', lambda m: number_to_vietnamese(m.group(1)) + ' đồng', s, flags=re.IGNORECASE)
    s = re.sub(r'(\d+)\s*vnd\b', lambda m: number_to_vietnamese(m.group(1)) + ' đồng', s, flags=re.IGNORECASE)
    s = re.sub(r'\$\s*(\d+)', lambda m: number_to_vietnamese(m.group(1)) + ' đô la', s)
    s = re.sub(r'(\d+)\s*\$', lambda m: number_to_vietnamese(m.group(1)) + ' đô la', s)
    # Số thập phân (1.5 -> một phẩy năm)
    s = re.sub(r'(\d+)[.,](\d+)', lambda m: number_to_vietnamese(m.group(1)) + ' phẩy ' + number_to_vietnamese(m.group(2)), s)
    # Các số nguyên còn lại
    s = re.sub(r'\b\d+\b', lambda m: number_to_vietnamese(m.group(0)), s)
    # Từ viết tắt phổ biến
    s = re.sub(r'\bOK\b', 'ô kê', s, flags=re.IGNORECASE)
    s = re.sub(r'\bTP\.?\s*HCM\b', 'thành phố Hồ Chí Minh', s, flags=re.IGNORECASE)
    s = re.sub(r'\bTP\.?\s*HN\b', 'thành phố Hà Nội', s, flags=re.IGNORECASE)
    s = re.sub(r'\bTP\.', 'thành phố ', s, flags=re.IGNORECASE)
    s = re.sub(r'\bĐ\/c\b', 'địa chỉ', s, flags=re.IGNORECASE)
    s = re.sub(r'\bĐT\b', 'điện thoại', s, flags=re.IGNORECASE)
    s = re.sub(r'\bBS\.', 'bác sĩ ', s, flags=re.IGNORECASE)
    s = re.sub(r'\bTS\.', 'tiến sĩ ', s, flags=re.IGNORECASE)
    s = re.sub(r'\bĐH\b', 'đại học', s, flags=re.IGNORECASE)
    return s

def vietnamese_phonemize(text_chunk: str) -> str:
    pieces = []
    for token in tokenize_text(text_chunk):
        if token.isspace():
            pieces.append(' ')
        elif WORD_RE.match(token):
            lower_token = token.lower()
            if lower_token in VI_PHONEME_OVERRIDE:
                pieces.append(VI_PHONEME_OVERRIDE[lower_token])
            else:
                raw = _backend_output_to_text(_backend.run(token))
                pieces.append(fix_phonemes(raw, source_text=token))
        else:
            pieces.append(fix_phonemes(token))
    res = ''.join(pieces).strip()
    res = re.sub(r'\btuː\b', 'tˈɔ', res)
    return res

def safe_split_text(text: str) -> list[str]:
    base_chunks = split_text(text)
    final_chunks = []
    for c in base_chunks:
        if len(c) <= 200:
            final_chunks.append(c)
        else:
            sub_parts = re.split(r'([,;:—–\r\n]+)', c)
            curr = ""
            for sp in sub_parts:
                if len(curr) + len(sp) > 200 and curr.strip():
                    final_chunks.append(curr.strip())
                    curr = sp
                else:
                    curr += sp
            if curr.strip():
                final_chunks.append(curr.strip())
    return final_chunks

class KokoroVietnameseONNXNoTorch:
    def __init__(self, repo_id=DEFAULT_HF_REPO_ID, voice=DEFAULT_VOICE, onnx_path=None, voicepack_dir=None, config_path=None):
        import onnxruntime as ort
        self.onnx_path = _download_or_resolve(repo_id, DEFAULT_ONNX_FILE, onnx_path)
        self.config_path = _download_or_resolve(repo_id, DEFAULT_CONFIG_FILE, config_path)
        
        with open(self.config_path, 'r', encoding='utf-8') as f:
            self.config = json.load(f)
        self.context_length = self.config['plbert']['max_position_embeddings']
        
        voicepack_filename = f"{voice}.npy"
        self.voicepack_path = os.path.join(voicepack_dir, voicepack_filename)
        if not os.path.exists(self.voicepack_path):
            raise FileNotFoundError(f"Không tìm thấy file giọng đọc npy: {self.voicepack_path}")
        self.voicepack = np.load(self.voicepack_path)
        
        self.session = ort.InferenceSession(str(self.onnx_path), providers=['CPUExecutionProvider'])
        
    def phonemes_to_input_ids(self, phonemes, vocab):
        input_ids = [vocab[p] for p in phonemes if p in vocab]
        if len(input_ids) + 2 > self.context_length:
            input_ids = input_ids[:self.context_length - 2]
        return np.asarray([[0, *input_ids, 0]], dtype=np.int64)
        
    def select_voice_style(self, phoneme_count):
        index = min(phoneme_count, self.voicepack.shape[0]) - 1
        return np.asarray(self.voicepack[index], dtype=np.float32)
        
    def synthesize(self, text, speed=1.0, crossfade_ms=50):
        audio_chunks = []
        phoneme_chunks = []
        speed_value = np.asarray(float(speed), dtype=np.float32)
        
        norm_text = normalize_vietnamese_text(text)
        for index, text_chunk in enumerate(safe_split_text(norm_text), start=1):
            ps = vietnamese_phonemize(text_chunk)
            if not ps:
                continue
            if len(ps) > 510:
                ps = ps[:508]
                
            phoneme_chunks.append(f'[{index}] {ps}')
            input_ids = self.phonemes_to_input_ids(ps, self.config['vocab'])
            ref_s = self.select_voice_style(len(ps))
            
            waveform, _duration = self.session.run(
                None,
                {
                    'input_ids': input_ids,
                    'ref_s': ref_s,
                    'speed': speed_value,
                },
            )
            audio_chunks.append(np.asarray(waveform, dtype=np.float32).reshape(-1))
            
        crossfade_samples = round(24000 * int(crossfade_ms) / 1000)
        audio = merge_audio_chunks(audio_chunks, crossfade_samples)
        return normalize_audio(audio), '\n'.join(phoneme_chunks)

app = FastAPI(title="Kokoro Vietnamese TTS API (ONNX-only)")

KOKORO_DIR = os.path.dirname(os.path.abspath(__file__))
VOICEPACKS_DIR = os.path.join(KOKORO_DIR, 'voicepacks')

tts_instances = {}

def get_tts_instance(voice: str):
    if voice not in tts_instances:
        print(f"Loading Kokoro ONNX model for voice: {voice}...")
        tts_instances[voice] = KokoroVietnameseONNXNoTorch(
            voice=voice,
            voicepack_dir=VOICEPACKS_DIR
        )
    return tts_instances[voice]

class TTSRequest(BaseModel):
    text: str
    voice: str = "diem_trinh"
    speed: float = 1.0

@app.post("/tts")
async def text_to_speech(req: TTSRequest):
    if not req.text.strip():
        raise HTTPException(status_code=400, detail="Text cannot be empty")
    
    try:
        tts = get_tts_instance(req.voice)
        audio, phonemes = tts.synthesize(req.text, speed=req.speed)
        wav_io = io.BytesIO()
        sf.write(wav_io, audio, 24000, format='WAV', subtype='PCM_16')
        wav_io.seek(0)
        return StreamingResponse(wav_io, media_type="audio/wav")
    except Exception as e:
        print(f"Error during TTS synthesis: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/health")
async def health_check():
    return {"status": "ok", "device": "cpu_onnx"}

if __name__ == "__main__":
    port = int(os.environ.get("KOKORO_PORT", 8889))
    uvicorn.run(app, host="0.0.0.0", port=port)

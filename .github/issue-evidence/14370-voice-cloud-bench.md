# Voice Cloud Benchmark

Generated: 2026-07-06T01:58:02.878Z

## Services

- Kokoro TTS: https://kokoro-tts-production-aa4b.up.railway.app
- Whisper STT: https://whisper-stt-production-6fc7.up.railway.app
- STT models: Systran/faster-whisper-tiny.en, Systran/faster-whisper-small

## Cloud TTS

| Case | Runs | p50 TTFB ms | p90 TTFB ms | p50 total ms | p90 total ms | p50 RTF | p50 bytes |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| short ack | 5 | 339 | 1990 | 368 | 2021 | 0.202 | 87644 |
| one sentence | 5 | 398 | 440 | 502 | 535 | 0.108 | 222044 |
| three sentences | 5 | 749 | 848 | 994 | 1092 | 0.099 | 482444 |

## Cloud STT RTT

| Clip | Actual sec | Model | Runs | p50 RTT ms | p90 RTT ms | First transcript sample |
| --- | ---: | --- | ---: | ---: | ---: | --- |
| clip_3s | 3.33 | Systran/faster-whisper-tiny.en | 5 | 589 | 886 | Eliza remind me to pack my bag before dinner. |
| clip_3s | 3.33 | Systran/faster-whisper-small | 5 | 1755 | 2310 | Eliza remind me to pack my bag before dinner. |
| clip_10s | 8.10 | Systran/faster-whisper-tiny.en | 5 | 711 | 757 | Eliza remind me to finish the science report before dinner, and if I have not st |
| clip_10s | 8.10 | Systran/faster-whisper-small | 5 | 2059 | 2185 | Eliza remind me to finish the science report before dinner, and if I have not st |
| clip_30s | 15.88 | Systran/faster-whisper-tiny.en | 5 | 893 | 1033 | Eliza, I work the late shift this week, and I keep forgetting where my sleep win |
| clip_30s | 15.88 | Systran/faster-whisper-small | 5 | 2688 | 2906 | Eliza, I work the late shift this week, and I keep forgetting where my sleep win |

## Cloud STT WER

| Model | Utterances | Mean WER | Median WER | p90 WER | Mean RTT ms |
| --- | ---: | ---: | ---: | ---: | ---: |
| Systran/faster-whisper-tiny.en | 12 | 0.076 | 0.000 | 0.200 | 638 |
| Systran/faster-whisper-small | 12 | 0.038 | 0.000 | 0.143 | 1690 |

## Committed Local Comparison Rows

| Backend | Device | Corpus | WER | RTF | Source |
| --- | --- | --- | ---: | ---: | --- |
| fused eliza-1-asr | Linux x86-64 CPU | 12 Kokoro utterances, 55.5 s | 0.008 | 0.262 | packages/ui/src/voice/STT_SELECTION.md |
| SFSpeechRecognizer | Apple silicon | 5 labelled utterances, quiet | 0.000 | 0.168 | packages/ui/src/voice/STT_SELECTION.md |

## Download Sizes

| Artifact | Size | Source |
| --- | ---: | --- |
| Kokoro q4_k_m GGUF | 60.0 MB | packages/shared/src/local-inference/voice-models.ts |
| Kokoro voice bin | 522.2 KB | packages/shared/src/local-inference/voice-models.ts |
| fused eliza-1-asr bundle | 1.00 GB | packages/ui/src/voice/STT_SELECTION.md |

## Audio Artifacts

| Kind | Path | Bytes | Description |
| --- | --- | ---: | --- |
| wav | audio/tts-short_ack-run-1.wav | 87644 | Cloud Kokoro TTS short ack run 1 |
| wav | audio/tts-one_sentence-run-1.wav | 222044 | Cloud Kokoro TTS one sentence run 1 |
| wav | audio/tts-three_sentences-run-1.wav | 482444 | Cloud Kokoro TTS three sentences run 1 |
| wav | audio/stt-source-clip_3s.wav | 159644 | Cloud Kokoro source audio for clip_3s |
| wav | audio/stt-source-clip_10s.wav | 388844 | Cloud Kokoro source audio for clip_10s |
| wav | audio/stt-source-clip_30s.wav | 762044 | Cloud Kokoro source audio for clip_30s |
| wav | audio/stt-source-wer_01.wav | 97244 | Cloud Kokoro source audio for wer_01 |

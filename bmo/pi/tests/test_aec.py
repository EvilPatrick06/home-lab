"""Test if PipeWire echo cancellation is active on default capture."""
import sounddevice as sd
import numpy as np

# Record 2 seconds
print("Recording 2s from default source...")
audio = sd.rec(int(16000 * 2), samplerate=16000, channels=1, dtype='int16')
sd.wait()

rms = np.sqrt(np.mean(audio.astype(np.float32) ** 2))
peak = np.max(np.abs(audio.astype(np.float32)))

# Check which device was actually used
info = sd.query_devices(sd.default.device[0], 'input')
print(f"Default input: {info['name']}")
print(f"RMS: {rms:.0f}, Peak: {peak:.0f}")

# Check PipeWire links to see if echo cancel is in the path
import subprocess
result = subprocess.run(['pw-link', '-l'], capture_output=True, text=True, timeout=5)
lines = result.stdout.split('\n')
echo_links = [l for l in lines if 'echo' in l.lower() or 'bmo_' in l.lower() or 'cancel' in l.lower()]
if echo_links:
    print("\nEcho cancel links found:")
    for l in echo_links:
        print(f"  {l.strip()}")
else:
    print("\nNo echo cancel links found in pw-link output")

# Show all active links for capture
capture_links = [l for l in lines if 'capture' in l.lower() or 'tonor' in l.lower()]
if capture_links:
    print("\nCapture-related links:")
    for l in capture_links[:10]:
        print(f"  {l.strip()}")

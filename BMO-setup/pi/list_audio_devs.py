import sounddevice as sd
devs = sd.query_devices()
for i, d in enumerate(devs):
    if d.get('max_input_channels', 0) > 0:
        print(f"{i}: {d['name']} (in={d['max_input_channels']}, rate={d['default_samplerate']})")

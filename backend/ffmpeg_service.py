import subprocess

def convert_to_mp3(input_file: str, output_file: str):
    cmd = [
        "ffmpeg", "-i", input_file,
        "-vn", "-ab", "192k", "-ar", "44100",
        "-y", output_file
    ]
    subprocess.run(cmd, check=True)
    return output_file

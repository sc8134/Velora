import subprocess

def convert_to_mp3(input_file, output_file):
    cmd = ["ffmpeg", "-i", input_file, output_file]
    subprocess.run(cmd, check=True)

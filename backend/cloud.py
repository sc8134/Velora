from pydrive.auth import GoogleAuth
from pydrive.drive import GoogleDrive

gauth = GoogleAuth()
gauth.LocalWebserverAuth()
drive = GoogleDrive(gauth)

file = drive.CreateFile({'title': 'video.mp4'})
file.SetContentFile('video.mp4')
file.Upload()

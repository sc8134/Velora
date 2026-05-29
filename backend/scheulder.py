from apscheduler.schedulers.background import BackgroundScheduler

scheduler = BackgroundScheduler()

def record_video(url):
    # yt-dlp download logic here
    pass

scheduler.add_job(lambda: record_video("https://youtube.com/..."), "cron", hour=10)
scheduler.start()

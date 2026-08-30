@echo off
echo [1/3] 필요한 패키지 설치중...
pip install -r requirements.txt

echo.
echo [2/3] .env 파일 확인중...
if not exist .env (
    echo .env 파일이 없습니다. .env 파일을 만들어주세요.
    pause
    exit
)

echo.
echo [3/3] 설치 완료!
echo 봇을 실행하려면 run_bot.bat 을 실행하세요.
pause

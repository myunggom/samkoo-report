@echo off
powershell -Command "Get-WmiObject Win32_Process | Where-Object {$_.CommandLine -like '*daily_log_bot*'} | ForEach-Object {$_.Terminate()}"
echo 봇이 종료되었습니다.
pause

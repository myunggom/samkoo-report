Dim WshShell, scriptDir
Set WshShell = CreateObject("WScript.Shell")
scriptDir = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)

' 기존 봇 프로세스 종료 (daily_log_bot 관련 Python 프로세스 전부)
WshShell.Run "powershell -Command ""Get-WmiObject Win32_Process | Where-Object {$_.CommandLine -like '*daily_log_bot*'} | ForEach-Object {$_.Terminate()}""", 0, True

' 프로세스가 완전히 종료될 때까지 반복 확인 (최대 10초)
Dim i, count
For i = 1 To 20
    WScript.Sleep 500
    Dim result
    result = WshShell.Run("powershell -Command ""$c = (Get-WmiObject Win32_Process | Where-Object {$_.CommandLine -like '*daily_log_bot*'}).Count; exit $c""", 0, True)
    If result = 0 Then Exit For
Next

' 완전히 종료된 후 새로 실행
WshShell.Run "py -3.12 """ & scriptDir & "\tools\daily_log_bot.py""", 0, False

Set WshShell = Nothing

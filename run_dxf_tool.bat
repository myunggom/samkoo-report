@echo off
py -3.12 "%~dp0tools\dxf_tool.py"
if errorlevel 1 pause

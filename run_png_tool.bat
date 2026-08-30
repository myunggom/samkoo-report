@echo off
py -3.12 "%~dp0tools\png_transparent_tool.py"
if errorlevel 1 pause

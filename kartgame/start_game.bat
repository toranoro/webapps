@echo off
cd /d "%~dp0"
echo Starting 3D KART GRAND PRIX on http://127.0.0.1:8080/ ...
start "" http://127.0.0.1:8080/
python serve_nocache.py 8080
pause

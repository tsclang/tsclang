@echo off
cd /d %~dp0
call "C:\Program Files\Microsoft Visual Studio\2022\Community\VC\Auxiliary\Build\vcvars64.bat"
cl test.c /Fe:test_msvc.exe
if exist test_msvc.exe (
    echo Compilation successful
    test_msvc.exe
)

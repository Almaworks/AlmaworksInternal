@echo off
setlocal

set SLEEP_SECONDS=18300

:loop
echo.
echo ========================================
echo Session starting at %date% %time%
echo ========================================

claude --dangerously-skip-permissions -p "You are continuing a long-running development sprint across multiple sessions. STEP 1: Read GOAL.md to understand the full objective. STEP 2: Read PROGRESS.md if it exists to see what is already done. STEP 3: Pick up from the next incomplete checkbox. Never redo completed work. STEP 4: Work through as many items as possible this session. STEP 5: Before stopping, update PROGRESS.md with every completed checkbox marked [x] and a NEXT SESSION section describing exactly where to resume. STEP 6: Commit all changes with a descriptive git commit message."

echo Session ended at %date% %time%
echo Sleeping %SLEEP_SECONDS% seconds...

powershell -command "Start-Sleep -Seconds %SLEEP_SECONDS%"

goto loop
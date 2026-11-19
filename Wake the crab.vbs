' Starts the helmet crab with no console window. If it is already running, this just opens its window.
Set fso = CreateObject("Scripting.FileSystemObject")
Set sh = CreateObject("WScript.Shell")
sh.CurrentDirectory = fso.GetParentFolderName(WScript.ScriptFullName)
If fso.FileExists("data\runs-as.txt") Then
  ' It runs under its own low-privilege Windows account, through a scheduled task.
  sh.Run "schtasks /run /tn ""Kerb""", 0, True
  WScript.Sleep 5000
  sh.Run "http://127.0.0.1:4810/"
ElseIf fso.FileExists(".venv\Scripts\pythonw.exe") Then
  ' Use the program's own Python environment (it has the optional cloud library) if it exists.
  sh.Run """.venv\Scripts\pythonw.exe"" crab.py", 0, False
Else
  sh.Run "pyw -3.12 crab.py", 0, False
End If

# Git Setup Script für Windows
# Führe dieses Script aus, um das Git Repository zu initialisieren

Write-Host "Initialisiere Git Repository..." -ForegroundColor Green

# Git Repository initialisieren
git init

# Alle Dateien hinzufügen (außer die in .gitignore)
git add .

# Status anzeigen
Write-Host "`nStatus:" -ForegroundColor Yellow
git status

# Ersten Commit erstellen
Write-Host "`nErstelle Initial Commit..." -ForegroundColor Green
git commit -m "Initial commit: FACEIT Wartescreen with Docker support"

Write-Host "`n✓ Git Repository erfolgreich initialisiert!" -ForegroundColor Green
Write-Host "`nNächste Schritte:" -ForegroundColor Yellow
Write-Host "1. Remote Repository hinzufügen:" -ForegroundColor White
Write-Host "   git remote add origin https://github.com/username/faceit-wartescreen.git" -ForegroundColor Gray
Write-Host "2. Branch umbenennen (optional):" -ForegroundColor White
Write-Host "   git branch -M main" -ForegroundColor Gray
Write-Host "3. Pushen:" -ForegroundColor White
Write-Host "   git push -u origin main" -ForegroundColor Gray

const { Client } = require('minecraft-launcher-core');
const path = require('path');
const fs = require('fs');
const https = require('https');
const http = require('http');
const AdmZip = require('adm-zip');
const { spawn } = require('child_process');
const launcher = new Client();

const FIXED_VERSION = "1.21.1";
const FIXED_MODPACK_URL = "https://download1531.mediafire.com/wzdbcfjel2qgCzlCfCV9qluAgT4Mk8lUMayWPH18L9ZnqExt69rEimmmOQ-j5V7OgA0ZqDkhgYAFwtkhiOcbyBHRCfUb5pZkfc1ex3W80jY2g4y-5znWdt-MiWokS8NbMk3EnI6FiD2eT-s29yY0M7B438DEVMvC1p0PGIPyA_o/3sxeftgtpvvamph/modpack.zip";

function downloadFile(url) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;

    const request = protocol.get(url, (response) => {
      // Suivre redirections
      if ([301, 302, 303, 307, 308].includes(response.statusCode)) {
        const redirectUrl = response.headers.location;
        console.log(`[INFO] Redirection vers: ${redirectUrl}`);
        return downloadFile(redirectUrl).then(resolve).catch(reject);
      }

      if (response.statusCode !== 200) {
        reject(new Error(`Échec du téléchargement (${response.statusCode})`));
        return;
      }

      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('end', () => {
        const buffer = Buffer.concat(chunks);

        // Vérifie que ce n’est pas une page HTML déguisée
        const head = buffer.slice(0, 100).toString();
        if (head.includes('<!DOCTYPE html') || head.includes('<html')) {
          reject(new Error("Le lien Dropbox ne fournit pas un fichier ZIP (probablement une page HTML)."));
          return;
        }

        resolve(buffer);
      });
    });

    request.on('error', reject);
  });
}

async function downloadModpack(url, targetDir) {
  const markerFile = path.join(targetDir, '.modpack_installed');
  
  if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });

  console.log(`[INFO] Téléchargement du modpack...`);

  const buffer = await downloadFile(url);
  const zipPath = path.join(targetDir, 'modpack.zip');
  fs.writeFileSync(zipPath, buffer);

  console.log(`[INFO] Extraction du modpack...`);
  const zip = new AdmZip(zipPath);
  zip.extractAllTo(targetDir, true);
  fs.unlinkSync(zipPath);

  fs.writeFileSync(markerFile, new Date().toISOString());
  console.log(`[INFO] Modpack extrait dans ${targetDir}`);
  return true;
}

function findForgeVersion(mcRoot) {
  const versionsDir = path.join(mcRoot, "versions");
  
  if (!fs.existsSync(versionsDir)) {
    return null;
  }

  const folders = fs.readdirSync(versionsDir);
  
  const forgeFolders = folders.filter(f => {
    const lower = f.toLowerCase();
    return (lower.includes('forge') || lower.includes('neoforge')) && lower.includes('1.21');
  });

  for (const forgeFolder of forgeFolders.sort((a, b) => b.length - a.length)) {
    const jsonPath = path.join(versionsDir, forgeFolder, `${forgeFolder}.json`);
    if (fs.existsSync(jsonPath)) {
      console.log(`[INFO] Version Forge trouvée : ${forgeFolder}`);
      return forgeFolder;
    }
  }

  return null;
}

function findForgeInstaller(mcRoot) {
  const files = fs.readdirSync(mcRoot);
  
  const installer = files.find(f => {
    const lower = f.toLowerCase();
    return (lower.includes('forge') || lower.includes('neoforge')) && 
           lower.includes('installer') && 
           f.endsWith('.jar');
  });

  return installer ? path.join(mcRoot, installer) : null;
}

async function installForge(installerPath, mcRoot) {
  console.log('[INFO] Installation de Forge...');
  console.log(`[INFO] Installateur: ${path.basename(installerPath)}`);
  console.log('[INFO] Cela peut prendre 2-3 minutes...');

  const versionsDir = path.join(mcRoot, 'versions');
  if (!fs.existsSync(versionsDir)) {
    fs.mkdirSync(versionsDir, { recursive: true });
  }

  const profilesPath = path.join(mcRoot, 'launcher_profiles.json');
  if (!fs.existsSync(profilesPath)) {
    const profiles = {
      "profiles": {
        "forge": {
          "name": "forge",
          "lastVersionId": FIXED_VERSION
        }
      },
      "version": 3
    };
    fs.writeFileSync(profilesPath, JSON.stringify(profiles, null, 2));
    console.log('[INFO] launcher_profiles.json cree');
  }

  return new Promise((resolve, reject) => {
    console.log('[INFO] Analyse de l\'installateur...');
    
    try {
      const installerZip = new AdmZip(installerPath);
      const entries = installerZip.getEntries();
      console.log(`[INFO] Installateur contient ${entries.length} fichiers`);
      
      const profileEntry = entries.find(e => e.entryName.includes('install_profile.json'));
      if (profileEntry) {
        const profileContent = JSON.parse(profileEntry.getData().toString('utf8'));
        console.log(`[INFO] Version cible: ${profileContent.version || 'inconnue'}`);
      }
    } catch (e) {
      console.log('[WARN] Impossible d\'analyser l\'installateur:', e.message);
    }

    const javaProcess = spawn('java', [
      '-jar', 
      installerPath, 
      '--installClient',
      mcRoot
    ], { 
      cwd: mcRoot
    });

    let output = '';
    let errorOutput = '';
    
    javaProcess.stdout.on('data', (data) => {
      const text = data.toString();
      output += text;
      console.log(`[FORGE] ${text.trim()}`);
    });
    
    javaProcess.stderr.on('data', (data) => {
      const text = data.toString();
      errorOutput += text;
      console.error(`[FORGE ERR] ${text.trim()}`);
    });

    javaProcess.on('close', (code) => {
      console.log(`[FORGE] Processus termine avec le code ${code}`);
      console.log('[INFO] Recherche de la version installee...');
      
      setTimeout(() => {
        const possiblePaths = [
          mcRoot,
          path.join(require('os').homedir(), 'AppData', 'Roaming', '.minecraft'),
          path.join(require('os').homedir(), '.minecraft')
        ];

        for (const checkPath of possiblePaths) {
          console.log(`[INFO] Verification dans: ${checkPath}`);
          const forgeVersion = findForgeVersion(checkPath);
          if (forgeVersion) {
            console.log(`[INFO] Forge trouve dans: ${checkPath}`);
            
            if (checkPath !== mcRoot) {
              console.log('[INFO] Copie des fichiers Forge...');
              const srcVersions = path.join(checkPath, 'versions', forgeVersion);
              const dstVersions = path.join(mcRoot, 'versions', forgeVersion);
              
              if (!fs.existsSync(path.join(mcRoot, 'versions'))) {
                fs.mkdirSync(path.join(mcRoot, 'versions'), { recursive: true });
              }
              
              copyFolderSync(srcVersions, dstVersions);
              
              const srcLibs = path.join(checkPath, 'libraries');
              const dstLibs = path.join(mcRoot, 'libraries');
              if (fs.existsSync(srcLibs)) {
                copyFolderSync(srcLibs, dstLibs);
              }
              
              console.log('[INFO] Copie terminee');
            }
            
            return resolve(forgeVersion);
          }
        }
        
        console.error('[ERREUR] Forge non trouve apres installation');
        console.error('Output complet:', output);
        console.error('Erreurs:', errorOutput);
        reject(new Error('Installation Forge echouee - version non trouvee apres installation'));
      }, 3000);
    });

    javaProcess.on('error', (err) => {
      if (err.code === 'ENOENT') {
        reject(new Error('Java non trouve ! Installez Java 17+ depuis https://adoptium.net/'));
      } else {
        reject(new Error(`Erreur Java: ${err.message}`));
      }
    });
  });
}

function copyFolderSync(src, dest) {
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }
  
  const entries = fs.readdirSync(src, { withFileTypes: true });
  
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    
    if (entry.isDirectory()) {
      copyFolderSync(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

async function ensureForgeLibraries(mcRoot, forgeJson) {
  const librariesDir = path.join(mcRoot, 'libraries');
  
  if (!forgeJson.libraries) {
    console.log('[INFO] Aucune librairie listee dans le JSON');
    return;
  }

  console.log(`[INFO] Verification de ${forgeJson.libraries.length} librairies...`);
  
  let missingCount = 0;
  const missingLibs = [];

  for (const lib of forgeJson.libraries) {
    if (!lib.downloads || !lib.downloads.artifact) {
      continue;
    }

    const artifact = lib.downloads.artifact;
    const libPath = path.join(librariesDir, artifact.path);

    if (!fs.existsSync(libPath)) {
      missingCount++;
      missingLibs.push({ name: lib.name, url: artifact.url, path: libPath });
    }
  }

  if (missingCount === 0) {
    console.log('[INFO] Toutes les librairies sont presentes');
    return;
  }

  console.log(`[INFO] ${missingCount} librairies manquantes, telechargement...`);

  for (const lib of missingLibs) {
    try {
      console.log(`[INFO] Telechargement: ${lib.name}`);
      const dir = path.dirname(lib.path);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      const data = await downloadFile(lib.url);
      fs.writeFileSync(lib.path, data);
      console.log(`[INFO]   OK`);
    } catch (err) {
      console.error(`[ERROR] Echec pour ${lib.name}: ${err.message}`);
    }
  }

  console.log('[INFO] Telechargement des librairies termine');
}

async function ensureForgeInstalled(mcRoot) {
  let forgeVersion = findForgeVersion(mcRoot);
  if (forgeVersion) {
    console.log(`[INFO] Forge deja installe: ${forgeVersion}`);
    return forgeVersion;
  }

  const installerPath = findForgeInstaller(mcRoot);
  if (!installerPath) {
    throw new Error('Aucun installateur Forge trouve dans le modpack !\n\nVotre modpack.zip doit contenir un fichier *forge*installer*.jar');
  }

  console.log(`[INFO] Installateur trouve: ${path.basename(installerPath)}`);

  forgeVersion = await installForge(installerPath, mcRoot);
  
  if (!forgeVersion) {
    throw new Error('Installation Forge echouee - version non trouvee apres installation');
  }

  return forgeVersion;
}

async function launchMinecraft(options) {
  const { modpackUrl, auth, useMicrosoft } = options;
  const mcRoot = path.join(__dirname, 'minecraft');

  if (!fs.existsSync(mcRoot)) fs.mkdirSync(mcRoot, { recursive: true });

  try {
    console.log('[INFO] ========================================');
    console.log('[INFO] Demarrage du launcher');
    console.log('[INFO] ========================================');

    console.log('[INFO] Etape 1/3 : Modpack');
    await downloadModpack(FIXED_MODPACK_URL, mcRoot);

    console.log('[INFO] Etape 2/3 : Installation Forge');
    const forgeVersion = await ensureForgeInstalled(mcRoot);
    
    console.log(`[INFO] Version Forge : ${forgeVersion}`);

    console.log('[INFO] Etape 3/3 : Lancement du jeu');

    const authorization = auth ? auth.mclc() : {
      access_token: 'null',
      client_token: 'null',
      uuid: 'null',
      name: 'Player',
      user_properties: '{}'
    };

    const forgeVersionDir = path.join(mcRoot, 'versions', forgeVersion);
    const forgeJsonPath = path.join(forgeVersionDir, `${forgeVersion}.json`);
    
    console.log('[INFO] Verification des fichiers Forge:');
    console.log(`[INFO]   Dossier: ${forgeVersionDir}`);
    console.log(`[INFO]   JSON exists: ${fs.existsSync(forgeJsonPath)}`);
    
    if (!fs.existsSync(forgeJsonPath)) {
      throw new Error(`Fichier JSON Forge manquant: ${forgeJsonPath}`);
    }

    const forgeJson = JSON.parse(fs.readFileSync(forgeJsonPath, 'utf8'));
    console.log(`[INFO] Version JSON: ${forgeJson.id}`);
    
    let vanillaVersion = FIXED_VERSION;
    if (forgeJson.inheritsFrom) {
      vanillaVersion = forgeJson.inheritsFrom;
      console.log(`[INFO] Version vanilla requise: ${vanillaVersion}`);
    }

    // Vérifier et télécharger les librairies manquantes
    console.log('[INFO] Verification des librairies Forge...');
    await ensureForgeLibraries(mcRoot, forgeJson);

    // Configuration avec les JVM arguments nécessaires pour NeoForge
    const launchOptions = {
      authorization: authorization,
      root: mcRoot,
      version: {
        number: vanillaVersion,
        type: "release",
        custom: forgeVersion
      },
      memory: {
        max: "4G",
        min: "2G",
      },
      customArgs: [
        // Arguments nécessaires pour NeoForge avec Java 17+
        '--add-opens', 'java.base/java.lang.invoke=ALL-UNNAMED',
        '--add-opens', 'java.base/jdk.internal.loader=ALL-UNNAMED',
        '--add-opens', 'java.base/java.net=ALL-UNNAMED',
        '--add-opens', 'java.base/java.nio=ALL-UNNAMED',
        '--add-opens', 'java.base/java.io=ALL-UNNAMED',
        '--add-opens', 'java.base/java.lang=ALL-UNNAMED',
        '--add-opens', 'java.base/java.lang.reflect=ALL-UNNAMED',
        '--add-opens', 'java.base/java.text=ALL-UNNAMED',
        '--add-opens', 'java.base/java.util=ALL-UNNAMED',
        '--add-opens', 'java.base/jdk.internal.reflect=ALL-UNNAMED',
        '--add-opens', 'java.base/sun.nio.ch=ALL-UNNAMED',
        '--add-opens', 'jdk.naming.dns/com.sun.jndi.dns=ALL-UNNAMED,java.naming',
        '--add-opens', 'java.desktop/sun.awt.image=ALL-UNNAMED'
      ],
      overrides: {
        detached: false
      }
    };

    console.log('[INFO] Configuration de lancement:');
    console.log(`[INFO]   - Version vanilla: ${vanillaVersion}`);
    console.log(`[INFO]   - Version Forge: ${forgeVersion}`);
    console.log(`[INFO]   - RAM: 2G-4G`);
    console.log(`[INFO]   - Compte: ${useMicrosoft ? 'Microsoft' : 'Hors ligne'}`);
    console.log(`[INFO]   - Root: ${mcRoot}`);
    
    // Vérifier que le dossier mods existe
    const modsDir = path.join(mcRoot, 'mods');
    if (fs.existsSync(modsDir)) {
      const mods = fs.readdirSync(modsDir).filter(f => f.endsWith('.jar'));
      console.log(`[INFO]   - Mods charges: ${mods.length}`);
      mods.forEach(mod => console.log(`[INFO]     * ${mod}`));
    } else {
      console.log('[INFO]   - Aucun dossier mods trouve');
    }
    
    console.log('[INFO] ========================================');
    console.log('[INFO] Lancement de Minecraft Forge...');

    launcher.launch(launchOptions);

    let gameOutput = '';
    let gameErrors = '';
    
    launcher.on('arguments', (args) => {
      console.log('[INFO] Arguments Java:');
      console.log(args.join(' '));
    });
    
    launcher.on('debug', (e) => {
      const msg = e.toString();
      console.log(`[DEBUG] ${msg}`);
      if (msg.includes('Error') || msg.includes('Exception')) {
        gameErrors += msg + '\n';
      }
    });
    
    launcher.on('data', (e) => {
      const line = e.toString().trim();
      gameOutput += line + '\n';
      console.log(`[GAME] ${line}`);
      
      if (line.includes('ERROR') || line.includes('FATAL') || line.includes('Exception')) {
        gameErrors += line + '\n';
      }
    });
    
    launcher.on('progress', (e) => {
      console.log(`[PROGRESS] ${e.type}: ${e.task}/${e.total}`);
    });
    
    launcher.on('close', (code) => {
      console.log(`[INFO] Minecraft ferme (code ${code})`);
      
      if (code !== 0) {
        console.error('[INFO] ========================================');
        console.error('[INFO] CRASH DETECTE');
        console.error('[INFO] ========================================');
        
        if (gameErrors) {
          console.error('[INFO] ERREURS DETECTEES:');
          console.error(gameErrors);
        }
        
        console.error('[INFO] Derniers logs (50 lignes):');
        const lastLines = gameOutput.split('\n').filter(l => l.trim()).slice(-50);
        lastLines.forEach(line => console.error(line));
        
        // Vérifier les logs Minecraft
        const logsDir = path.join(mcRoot, 'logs');
        const latestLog = path.join(logsDir, 'latest.log');
        if (fs.existsSync(latestLog)) {
          console.error('[INFO] Contenu de logs/latest.log:');
          const logContent = fs.readFileSync(latestLog, 'utf8');
          const logLines = logContent.split('\n').slice(-30);
          logLines.forEach(line => console.error(line));
        }
        
        console.error('[INFO] ========================================');
      }
    });
    
    launcher.on('error', (e) => {
      console.error(`[ERROR] ${e}`);
      gameErrors += `ERROR: ${e}\n`;
    });

    return `Minecraft Forge ${forgeVersion} lance !\n\n${useMicrosoft ? 'Compte Microsoft connecte' : 'Mode hors ligne'}`;

  } catch (err) {
    console.error(`[ERREUR CRITIQUE] ${err.message}`);
    console.error(err.stack);
    return `Erreur: ${err.message}`;
  }
}

module.exports = { launchMinecraft };
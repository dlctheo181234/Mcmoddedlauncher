const { Client } = require('minecraft-launcher-core');
const path = require('path');
const fs = require('fs');
const https = require('https');
const http = require('http');
const AdmZip = require('adm-zip');
const { spawn } = require('child_process');
const launcher = new Client();

const FIXED_VERSION = "1.21.1";
const FIXED_MODPACK_URL = "https://github.com/dlctheo181234/Server-Modpack/releases/download/Release/modpack.zip";
const FIXED_MODLOADER = "forge";

function downloadFile(url) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;
    
    protocol.get(url, (response) => {
      // Gérer les redirections
      if (response.statusCode === 301 || response.statusCode === 302) {
        return downloadFile(response.headers.location).then(resolve).catch(reject);
      }
      
      if (response.statusCode !== 200) {
        reject(new Error(`Échec du téléchargement (${response.statusCode})`));
        return;
      }

      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('end', () => resolve(Buffer.concat(chunks)));
      response.on('error', reject);
    }).on('error', reject);
  });
}

async function downloadModpack(url, targetDir) {
  const markerFile = path.join(targetDir, '.modpack_installed');
  if (fs.existsSync(markerFile)) {
    console.log('[INFO] Modpack déjà installé, skip download');
    return;
  }

  if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });

  console.log(`[INFO] Téléchargement du modpack depuis ${url}...`);

  const buffer = await downloadFile(url);
  const zipPath = path.join(targetDir, 'modpack.zip');
  fs.writeFileSync(zipPath, buffer);

  console.log(`[INFO] Extraction du modpack...`);
  const zip = new AdmZip(zipPath);
  zip.extractAllTo(targetDir, true);
  fs.unlinkSync(zipPath);

  fs.writeFileSync(markerFile, new Date().toISOString());
  console.log(`[INFO] Modpack extrait dans ${targetDir}`);
}

function createLauncherProfile(mcRoot) {
  const launcherProfilesPath = path.join(mcRoot, 'launcher_profiles.json');
  
  if (fs.existsSync(launcherProfilesPath)) {
    console.log('[INFO] launcher_profiles.json existe déjà');
    return;
  }

  console.log('[INFO] Création de launcher_profiles.json...');
  
  const launcherProfiles = {
    "profiles": {
      "forge": {
        "name": "forge",
        "type": "custom",
        "created": new Date().toISOString(),
        "lastUsed": new Date().toISOString(),
        "icon": "Furnace",
        "lastVersionId": FIXED_VERSION
      }
    },
    "settings": {
      "enableSnapshots": false,
      "enableAdvanced": false
    },
    "version": 3
  };

  fs.writeFileSync(launcherProfilesPath, JSON.stringify(launcherProfiles, null, 2));
  console.log('[INFO] ✅ launcher_profiles.json créé');
}

function findForgeVersion(mcRoot) {
  const versionsDir = path.join(mcRoot, "versions");
  
  if (!fs.existsSync(versionsDir)) {
    return null;
  }

  const folders = fs.readdirSync(versionsDir);
  
  // Chercher un dossier qui contient "forge" ou "neoforge" avec la version Minecraft
  const forgeFolder = folders.find(f => {
    const lower = f.toLowerCase();
    return (lower.includes('forge') || lower.includes('neoforge')) && 
           lower.includes(FIXED_VERSION.replace(/\./g, '.'));
  });

  if (forgeFolder) {
    const jsonPath = path.join(versionsDir, forgeFolder, `${forgeFolder}.json`);
    if (fs.existsSync(jsonPath)) {
      console.log(`[INFO] ✅ Version Forge trouvée : ${forgeFolder}`);
      return forgeFolder;
    }
  }

  return null;
}

async function installNeoForgeIfNeeded(mcRoot) {
  console.log("[INFO] Vérification de l'installation de NeoForge...");

  // D'abord vérifier si Forge est déjà installé
  const existingForge = findForgeVersion(mcRoot);
  if (existingForge) {
    return existingForge;
  }

  // Créer le profil launcher nécessaire
  createLauncherProfile(mcRoot);

  // Recherche du jar d'installation
  const allFiles = fs.readdirSync(mcRoot);
  const installer = allFiles.find(f => 
    (f.toLowerCase().includes("neoforge") || f.toLowerCase().includes("forge")) && 
    f.endsWith(".jar") &&
    f.toLowerCase().includes("installer")
  );

  if (!installer) {
    console.warn("[WARN] Aucun installateur NeoForge trouvé !");
    return null;
  }

  const installerPath = path.join(mcRoot, installer);
  console.log(`[INFO] Installation de NeoForge via ${installerPath}...`);
  console.log(`[INFO] Cela peut prendre plusieurs minutes...`);

  await new Promise((resolve, reject) => {
    // Utiliser --installClient avec le chemin du dossier minecraft
    const java = spawn('java', ['-jar', installerPath, '--installClient', mcRoot], { 
      cwd: mcRoot
    });

    let output = '';
    
    java.stdout.on('data', d => {
      const text = d.toString();
      output += text;
      console.log(`[FORGE] ${text.trim()}`);
    });
    
    java.stderr.on('data', d => {
      const text = d.toString();
      output += text;
      console.error(`[FORGE] ${text.trim()}`);
    });

    java.on('close', code => {
      if (code === 0 || output.includes('Successfully') || output.includes('complete')) {
        console.log("[INFO] ✅ NeoForge installé avec succès !");
        resolve();
      } else {
        reject(new Error(`Échec de l'installation NeoForge (code ${code})`));
      }
    });

    java.on('error', err => {
      if (err.code === 'ENOENT') {
        reject(new Error('Java n\'est pas installé ou n\'est pas dans le PATH système'));
      } else {
        reject(new Error(`Erreur lors du lancement de Java: ${err.message}`));
      }
    });
  });

  // Attendre un peu que les fichiers soient écrits
  await new Promise(resolve => setTimeout(resolve, 2000));

  // Récupérer le nom de la version installée
  return findForgeVersion(mcRoot);
}

async function launchMinecraft(options) {
  const { modpackUrl, auth, useMicrosoft } = options;
  const mcRoot = path.join(__dirname, 'minecraft');

  if (!fs.existsSync(mcRoot)) fs.mkdirSync(mcRoot, { recursive: true });

  try {
    // 1️⃣ Télécharger et extraire le modpack
    if (modpackUrl) {
      await downloadModpack(FIXED_MODPACK_URL, mcRoot);
    }

    let versionToUse = FIXED_VERSION;
    let forgeVersion = null;

    // 2️⃣ Vérifier si Forge est déjà installé
    if (FIXED_MODLOADER === 'forge') {
      forgeVersion = findForgeVersion(mcRoot);
      
      if (!forgeVersion) {
        console.log('[INFO] ⚠️  NeoForge non installé');
        console.log('[INFO] 📦 Installation manuelle requise :');
        console.log(`[INFO] 1. Cherchez le fichier *installer.jar dans ${mcRoot}`);
        console.log(`[INFO] 2. Double-cliquez dessus et choisissez "Install client"`);
        console.log(`[INFO] 3. Sélectionnez le dossier: ${mcRoot}`);
        console.log(`[INFO] 4. Relancez le launcher après l'installation`);
        
        // Essayer l'installation automatique quand même
        try {
          forgeVersion = await installNeoForgeIfNeeded(mcRoot);
        } catch (err) {
          console.error(`[WARN] Installation auto échouée: ${err.message}`);
          return `⚠️  Installation NeoForge requise\n\nVeuillez:\n1. Ouvrir le dossier: ${mcRoot}\n2. Double-cliquer sur le fichier *installer.jar\n3. Choisir "Install client" et sélectionner le dossier ci-dessus\n4. Relancer le launcher`;
        }
      }
      
      if (forgeVersion) {
        versionToUse = forgeVersion;
        console.log(`[INFO] ✅ Version Forge sélectionnée : ${forgeVersion}`);
      } else {
        console.warn('[WARN] Forge non trouvé, lancement en vanilla');
      }
    }

    // 3️⃣ Configuration de l'autorisation
    const authorization = auth ? auth.mclc() : {
      access_token: 'null',
      client_token: 'null',
      uuid: 'null',
      name: 'Player',
      user_properties: '{}'
    };

    // 4️⃣ Lancer Minecraft
    const launchOptions = {
      authorization: authorization,
      root: mcRoot,
      version: {
        number: versionToUse,
        type: forgeVersion ? "custom" : "release"
      },
      memory: {
        max: "4G",
        min: "2G",
      },
      forge: forgeVersion ? mcRoot : undefined
    };

    console.log('[INFO] 🚀 Lancement de Minecraft...');
    console.log(`[INFO] Version: ${versionToUse}`);
    console.log(`[INFO] Dossier: ${mcRoot}`);

    launcher.launch(launchOptions);

    launcher.on('debug', e => console.log(`[DEBUG] ${e}`));
    launcher.on('data', e => console.log(`[DATA] ${e}`));
    launcher.on('progress', e => {
      if (e.type === 'assets' || e.type === 'libraries') {
        console.log(`[PROGRESS] ${e.type}: ${e.task}/${e.total}`);
      }
    });
    launcher.on('close', code => console.log(`[INFO] ✅ Minecraft fermé (code ${code})`));
    launcher.on('error', e => console.error(`[ERROR] ❌ ${e}`));

    return `Minecraft ${versionToUse} lancé 🎮 ${useMicrosoft ? "(Microsoft)" : "(Hors ligne)"}`;

  } catch (err) {
    console.error(`[ERREUR CRITIQUE] ${err.message}`);
    console.error(err.stack);
    return `Erreur: ${err.message}`;
  }
}

module.exports = { launchMinecraft };
const { Client } = require('minecraft-launcher-core');
const path = require('path');
const fs = require('fs');
const fetch = require('node-fetch');
const AdmZip = require('adm-zip');
const { spawn } = require('child_process');
const launcher = new Client();

const FIXED_VERSION = "1.21.1";
const FIXED_MODPACK_URL = "https://github.com/dlctheo181234/Server-Modpack/releases/download/Release/modpack.zip";
const FIXED_MODLOADER = "forge";

async function downloadModpack(url, targetDir) {
  // Vérifier si le modpack existe déjà
  const markerFile = path.join(targetDir, '.modpack_installed');
  if (fs.existsSync(markerFile)) {
    console.log('[INFO] Modpack déjà installé, skip download');
    return;
  }

  if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });

  console.log(`[INFO] Téléchargement du modpack depuis ${url}...`);

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Échec du téléchargement (${res.status})`);

  const buffer = await res.arrayBuffer();
  const zipPath = path.join(targetDir, 'modpack.zip');
  fs.writeFileSync(zipPath, Buffer.from(buffer));

  console.log(`[INFO] Extraction du modpack...`);
  const zip = new AdmZip(zipPath);
  zip.extractAllTo(targetDir, true);
  fs.unlinkSync(zipPath);

  // Créer un fichier marqueur
  fs.writeFileSync(markerFile, new Date().toISOString());
  console.log(`[INFO] Modpack extrait dans ${targetDir}`);
}

async function installNeoForgeIfNeeded(mcRoot) {
  console.log("[INFO] Vérification de l'installation de NeoForge...");

  const versionsDir = path.join(mcRoot, "versions");
  
  // Chercher si une version NeoForge existe déjà
  if (fs.existsSync(versionsDir)) {
    const folders = fs.readdirSync(versionsDir);
    const neoforgeVersion = folders.find(f => 
      f.toLowerCase().includes('neoforge') || f.toLowerCase().includes('forge')
    );
    
    if (neoforgeVersion) {
      const jsonPath = path.join(versionsDir, neoforgeVersion, `${neoforgeVersion}.json`);
      if (fs.existsSync(jsonPath)) {
        console.log(`[INFO] ✅ NeoForge déjà installé : ${neoforgeVersion}`);
        return neoforgeVersion;
      }
    }
  }

  // Recherche du jar d'installation
  const allFiles = fs.readdirSync(mcRoot);
  const installer = allFiles.find(f => 
    (f.toLowerCase().includes("neoforge") || f.toLowerCase().includes("forge")) && 
    f.endsWith(".jar") &&
    f.toLowerCase().includes("installer")
  );

  if (!installer) {
    console.warn("[WARN] Aucun installateur NeoForge trouvé dans le modpack !");
    return null;
  }

  const installerPath = path.join(mcRoot, installer);
  console.log(`[INFO] Installation de NeoForge via ${installerPath}...`);

  await new Promise((resolve, reject) => {
    const java = spawn('java', ['-jar', installerPath, '--installClient'], { 
      cwd: mcRoot,
      stdio: 'inherit' // Pour voir les logs de l'installation
    });

    java.on('close', code => {
      if (code === 0) {
        console.log("[INFO] ✅ NeoForge installé avec succès !");
        resolve();
      } else {
        reject(new Error(`Échec de l'installation NeoForge (code ${code})`));
      }
    });

    java.on('error', err => {
      reject(new Error(`Erreur lors du lancement de Java: ${err.message}`));
    });
  });

  // Récupérer le nom de la version installée
  if (fs.existsSync(versionsDir)) {
    const folders = fs.readdirSync(versionsDir);
    const neoforgeVersion = folders.find(f => 
      f.toLowerCase().includes('neoforge') || f.toLowerCase().includes('forge')
    );
    return neoforgeVersion;
  }

  return null;
}

async function launchMinecraft(options) {
  const { modpackUrl, auth, useMicrosoft } = options;
  const mcRoot = path.join(__dirname, 'minecraft');

  if (!fs.existsSync(mcRoot)) fs.mkdirSync(mcRoot, { recursive: true });

  // 1️⃣ Télécharger et extraire le modpack
  if (modpackUrl) {
    try {
      await downloadModpack(FIXED_MODPACK_URL, mcRoot);
    } catch (err) {
      console.error(`[ERREUR] Téléchargement modpack : ${err}`);
      return `Erreur : ${err.message}`;
    }
  }

  let versionToUse = FIXED_VERSION;

  // 2️⃣ Installer NeoForge s'il est présent
  if (FIXED_MODLOADER === 'forge') {
    try {
      const forgeVersion = await installNeoForgeIfNeeded(mcRoot);
      if (forgeVersion) {
        versionToUse = forgeVersion;
        console.log(`[INFO] Version Forge sélectionnée : ${forgeVersion}`);
      }
    } catch (err) {
      console.error(`[ERREUR] Installation NeoForge : ${err}`);
      return `Erreur lors de l'installation NeoForge : ${err.message}`;
    }
  }
  
  // 3️⃣ Lancer Minecraft
  const launchOptions = {
    authorization: auth ? auth.mclc() : {
      access_token: 'null',
      client_token: 'null',
      uuid: 'null',
      name: 'Player',
      user_properties: '{}'
    },
    root: mcRoot,
    version: {
      number: versionToUse,
      type: "release"
    },
    memory: {
      max: "4G",
      min: "2G",
    },
  };

  console.log('[INFO] Options de lancement:', JSON.stringify(launchOptions, null, 2));

  launcher.launch(launchOptions);

  launcher.on('debug', e => console.log(`[DEBUG] ${e}`));
  launcher.on('data', e => console.log(`[DATA] ${e}`));
  launcher.on('progress', e => console.log(`[PROGRESS] ${e.type} ${e.task}/${e.total}`));
  launcher.on('close', code => console.log(`[INFO] Minecraft fermé avec le code ${code}`));
  launcher.on('error', e => console.error(`[ERROR] ${e}`));

  return `Minecraft ${versionToUse} lancé 🎮 ${useMicrosoft ? "(compte Microsoft)" : "(mode hors ligne)"}`;
}

module.exports = { launchMinecraft };
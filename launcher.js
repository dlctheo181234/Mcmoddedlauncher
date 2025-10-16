const { Client } = require('minecraft-launcher-core');
const path = require('path');
const fs = require('fs');
const fetch = require('node-fetch');
const AdmZip = require('adm-zip');
const { spawn } = require('child_process');
const launcher = new Client();

const FIXED_VERSION = "1.21.1"; // <-- version Minecraft que tu veux lancer
const FIXED_MODPACK_URL = "https://github.com/dlctheo181234/Server-Modpack/releases/download/Release/modpack.zip"; // ton modpack
const FIXED_MODLOADER = "forge"; // ou "vanilla" si pas de modloader

async function downloadModpack(url, targetDir) {
  if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });

  console.log(`[INFO] Téléchargement du modpack depuis ${url}...`);

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Échec du téléchargement (${res.status})`);

  const contentType = res.headers.get('content-type');
  if (!contentType.includes('zip')) {
    throw new Error(`Le fichier téléchargé n’est pas un ZIP (content-type: ${contentType})`);
  }

  const buffer = await res.arrayBuffer();
  const zipPath = path.join(targetDir, 'modpack.zip');
  fs.writeFileSync(zipPath, Buffer.from(buffer));

  console.log(`[INFO] Extraction du modpack...`);
  const zip = new AdmZip(zipPath);
  zip.extractAllTo(targetDir, true);
  fs.unlinkSync(zipPath);

  console.log(`[INFO] Modpack extrait dans ${targetDir}`);
}

async function installNeoForgeIfNeeded(mcRoot) {
  console.log("[INFO] Vérification de l’installation de NeoForge...");

  // Dossier versions
  const versionDir = path.join(mcRoot, "versions", "neoforge");
  if (fs.existsSync(path.join(versionDir, "neoforge.json"))) {
    console.log("[INFO] ✅ NeoForge déjà installé, on continue...");
    return;
  }

  // Recherche du jar d’installation
  const allFiles = fs.readdirSync(mcRoot);
  const installer = allFiles.find(f => f.toLowerCase().includes("neoforge") && f.endsWith(".jar"));

  if (!installer) {
    console.warn("[WARN] Aucun installateur NeoForge trouvé dans le modpack !");
    return;
  }

  const installerPath = path.join(mcRoot, installer);
  console.log(`[INFO] Installation de NeoForge via ${installerPath}...`);

  await new Promise((resolve, reject) => {
    const java = spawn('java', ['-jar', installerPath, '--installClient'], { cwd: mcRoot });

    java.stdout.on('data', d => process.stdout.write(`[FORGE] ${d}`));
    java.stderr.on('data', d => process.stderr.write(`[FORGE] ${d}`));

    java.on('close', code => {
      if (code === 0) {
        console.log("[INFO] ✅ NeoForge installé avec succès !");
        resolve();
      } else {
        reject(new Error(`Échec de l’installation NeoForge (code ${code})`));
      }
    });
  });

  if (!fs.existsSync(path.join(versionDir, "neoforge.json"))) {
    throw new Error("NeoForge ne semble pas s’être installé correctement.");
  }
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

  // 2️⃣ Installer NeoForge s’il est présent
  if (FIXED_MODLOADER === 'forge') {
    try {
      await installNeoForgeIfNeeded(mcRoot);
    } catch (err) {
      console.error(`[ERREUR] Installation NeoForge : ${err}`);
      return `Erreur lors de l’installation NeoForge : ${err.message}`;
    }
  }

  const versionsDir = path.join(mcRoot, 'versions');
  let customVersion = FIXED_VERSION;

  if (fs.existsSync(versionsDir)) {
    const found = fs.readdirSync(versionsDir).find(v => v.toLowerCase().includes('neoforge'));
    if (found) {
      customVersion = found;
      console.log(`[INFO] Version NeoForge détectée : ${found}`);
    }
  }
  
  // 3️⃣ Lancer Minecraft
  const launchOptions = {
    clientPackage: null,
    authorization: auth ? auth.mclc() : undefined,
    root: mcRoot,
    version: {
      number: FIXED_VERSION,
      type: "release",
      custom: customVersion,
    },
    memory: {
      max: "4G",
      min: "2G",
    },
  };

  launcher.launch(launchOptions);

  launcher.on('debug', e => console.log(`[DEBUG] ${e}`));
  launcher.on('data', e => console.log(`[DATA] ${e}`));
  launcher.on('error', e => console.error(`[ERROR] ${e}`));

  return `Minecraft NeoForge lancé avec le modpack GitHub 🎮 ${useMicrosoft ? "compte Microsoft" : "mode hors ligne"}`;
}

module.exports = { launchMinecraft };
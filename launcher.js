const { Client } = require('minecraft-launcher-core');
const path = require('path');
const fs = require('fs');
const fetch = require('node-fetch');
const AdmZip = require('adm-zip');
const { spawn } = require('child_process');
const launcher = new Client();

async function downloadModpack(url, targetDir) {
  // Vérifie si le dossier existe
  if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });

  console.log(`[INFO] Téléchargement du modpack depuis ${url}...`);

  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Échec du téléchargement (${res.status})`);

    const buffer = await res.arrayBuffer();
    const zipPath = path.join(targetDir, 'modpack.zip');
    fs.writeFileSync(zipPath, Buffer.from(buffer));

    console.log(`[INFO] Extraction du modpack...`);
    const zip = new AdmZip(zipPath);
    zip.extractAllTo(targetDir, true);
    fs.unlinkSync(zipPath);

    console.log(`[INFO] Modpack extrait dans ${targetDir}`);
  } catch (err) {
    console.error(`[ERREUR] Téléchargement modpack : ${err.message}`);
    throw err;
  }
}

async function installNeoForgeIfNeeded(mcRoot) {
  // Recherche du fichier .jar de NeoForge
  const files = fs.readdirSync(mcRoot);
  const installer = files.find(f => f.toLowerCase().includes('neoforge') && f.endsWith('.jar'));

  if (!installer) {
    console.log("[INFO] Aucun installateur NeoForge trouvé, on passe.");
    return null;
  }

  const installerPath = path.join(mcRoot, installer);
  console.log(`[INFO] Installation de NeoForge via ${installerPath}...`);

  // Lancer le jar NeoForge avec Java
  await new Promise((resolve, reject) => {
    const java = spawn('java', ['-jar', installerPath, '--installClient'], { cwd: mcRoot });

    java.stdout.on('data', d => process.stdout.write(`[FORGE] ${d}`));
    java.stderr.on('data', d => process.stderr.write(`[FORGE] ${d}`));

    java.on('close', code => {
      if (code === 0) {
        console.log("[INFO] NeoForge installé avec succès !");
        resolve();
      } else {
        reject(new Error(`Échec de l’installation NeoForge (code ${code})`));
      }
    });
  });

  return installerPath;
}

async function launchMinecraft(options) {
  const { version, modLoader, modpackUrl, auth } = options;
  const mcRoot = path.join(__dirname, 'minecraft');

  if (!fs.existsSync(mcRoot)) fs.mkdirSync(mcRoot, { recursive: true });

  // 1️⃣ Télécharger et extraire le modpack
  if (modpackUrl) {
    try {
      await downloadModpack(modpackUrl, mcRoot);
    } catch (err) {
      console.error(`[ERREUR] Téléchargement modpack : ${err}`);
      return `Erreur : ${err.message}`;
    }
  }

  // 2️⃣ Installer NeoForge s’il est présent
  if (modLoader === 'forge') {
    try {
      await installNeoForgeIfNeeded(mcRoot);
    } catch (err) {
      console.error(`[ERREUR] Installation NeoForge : ${err}`);
      return `Erreur lors de l’installation NeoForge : ${err.message}`;
    }
  }

  
  // 3️⃣ Lancer Minecraft
  const launchOptions = {
    clientPackage: null,
    authorization: auth ? auth.mclc() : undefined,
    root: mcRoot,
    version: {
      number: version || "1.21.1",
      type: "release",
      custom: "neoforge"
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
# 🐗 Kassongo Safari Adventure — Mobile Web Game (2D Infinite Runner)

Une application de jeu vidéo mobile au format Web (HTML5/CSS3/ES6+ Canvas) hautement optimisée, conçue pour être encapsulée et publiée sur le Google Play Store. 

Ce projet intègre des fonctionnalités avancées d'adaptation environnementale basées sur la géolocalisation réelle du joueur (GPS) et les conditions météorologiques en temps réel.

---

## 🚀 Fonctionnalités Majeures

- **Gameplay Arcade Évolutif :** Un *Infinite Runner* où le joueur contrôle un phacochère de Kassongo devant sauter par-dessus un lion. La vitesse globale du jeu et le rythme d'apparition des obstacles augmentent progressivement.
- **Environnement Temps Réel Dynamique (GPS & Météo) :**
  - **Cycle Jour/Nuit automatique :** L'application interroge la position GPS de l'appareil pour calculer l'heure locale et charger le décor adapté (`fond_jour.png` ou `fond_nuit.png`).
  - **Météo dynamique :** Connexion en temps réel à l'API OpenWeatherMap. S'il pleut réellement à l'emplacement géographique du joueur, un moteur de particules Canvas simule une pluie interactive sur l'écran.
- **Persistance des Données :** Sauvegarde locale et instantanée du meilleur score de l'appareil via l'API `LocalStorage`.
- **Audio Immersif :** Gestion propre des flux audio (`AudioContext`) respectant les contraintes strictes des navigateurs mobiles d'aujourd'hui (déclenchement fluide dès le clic sur "Jouer").
- **Architecture Moderne (ES6+) :** Code orienté objet propre, factorisé et prêt pour la compilation descendante (Transpilation).

---

## 📁 Architecture des Fichiers

```text
kassongo-safari/
├── dist/                     # Code compilé en ES5 par Babel (prêt pour le Play Store)
├── assets/                   # Ressources multimédias
│   ├── fond_jour.png         # Décor de la savane en journée
│   ├── fond_nuit.png         # Décor de la savane de nuit
│   ├── warthog_sprite.png    # Feuille de sprites du phacochère
│   ├── lion_sprite.png       # Feuille de sprites du lion
│   └── audio_fond.mp3        # Musique d'ambiance safari
├── index.html                # Interface utilisateur & conteneur Canvas
├── style.css                 # Styles responsive mobiles & transitions de thèmes
├── game.js                   # Moteur de jeu principal en JS Moderne (ES6+)
├── .babelrc                  # Fichier de configuration Babel
├── package.json              # Dépendances Node.js et scripts de build
└── README.md                 # Documentation du projet
```

---

## 🛠️ Configuration Technique & Installation

### 1. Prérequis
Assurez-vous d'avoir installé [Node.js](https://nodejs.org) sur votre machine de développement.

### 2. Installation des dépendances (Babel)
Clonez ou créez le répertoire du projet, puis exécutez la commande suivante dans votre terminal pour installer Babel et ses extensions de compatibilité mobile :

```bash
npm install --save-dev @babel/core @babel/cli @babel/preset-env
```

### 3. Configuration de l'API Météo
1. Créez un compte gratuit sur [OpenWeatherMap](https://openweathermap.org).
2. Récupérez votre clé API (API Key).
3. Ouvrez le fichier `game.js`, localisez la constante `WEATHER_API_KEY` et collez votre clé :
   ```javascript
   const WEATHER_API_KEY = "VOTRE_CLE_API_ICI";
   ```

---

## 📦 Compiler et Lancer le Jeu

### Exécuter la compilation Babel
Pour convertir le code JavaScript moderne (ES6+) en JavaScript classique (ES5) hautement compatible avec les anciens smartphones Android, lancez la commande de build :

```bash
npm run build
```
*(Alternative directe en ligne de commande : `npx babel game.js --out-file dist/game.js`)*

### Lancement en local
En raison des restrictions de sécurité des navigateurs concernant la géolocalisation (`navigator.geolocation`) et le chargement des ressources, le jeu **doit obligatoirement** être exécuté derrière un serveur local. 

Vous pouvez utiliser l'extension **Live Server** sur VS Code, ou lancer la commande suivante si vous possédez Python :
```bash
python -m http.server 8000
```
Ouvrez ensuite votre navigateur sur `http://localhost:8000`. **Pensez à autoriser l'accès à la position géographique** lorsque le navigateur vous le demandera.

---

## 📱 Export vers le Google Play Store
Ce projet est entièrement compatible avec les frameworks d'encapsulation mobile hybrides. Pour générer l'APK final :
1. Utilisez **Capacitor** d'Ionic (`npm install @capacitor/core @capacitor/cli`).
2. Initialisez le projet mobile avec `npx cap init`.
3. Ajoutez la plateforme Android via `npx cap add android`.
4. Configurez le fichier `AndroidManifest.xml` pour forcer l'orientation en mode paysage (`landscape`) et accorder l'autorisation `ACCESS_FINE_LOCATION` au smartphone.

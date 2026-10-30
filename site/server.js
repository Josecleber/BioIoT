const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const dbPath = path.resolve(__dirname, 'banco.db');
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Erro ao abrir o banco de dados SQLite:', err.message);
    } else {
        console.log('Conectado ao banco de dados SQLite com sucesso.');
    }
});

db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS pacientes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nome TEXT NOT NULL,
        idade INTEGER NOT NULL,
        dispositivo TEXT NOT NULL
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS leituras (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        dispositivo TEXT NOT NULL,
        bpm INTEGER NOT NULL,
        spo2 INTEGER NOT NULL,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
});

let ultimaConexaoESP = null;
let estadosUI = {};

// Recebe periodicamente o sinal de vida do ESP32
app.post('/api/heartbeat', (req, res) => {
    const { dispositivo } = req.body;

    if (typeof dispositivo !== 'string' || !dispositivo.trim()) {
        return res.status(400).json({
            erro: 'Dispositivo não informado'
        });
    }

    ultimaConexaoESP = Date.now();

    res.status(200).json({
        status: 'online',
        dispositivo
    });
});

app.get('/api/status-esp', (req, res) => {
    if (!ultimaConexaoESP) {
        return res.json({ online: false });
    }
    const tempoDecorrido = Date.now() - ultimaConexaoESP;
    const online = tempoDecorrido < 10000;
    
    res.json({ online });
});

app.get('/api/pacientes', (req, res) => {
    db.all(`SELECT * FROM pacientes`, [], (err, rows) => {
        if (err) return res.status(500).json({ erro: err.message });
        res.json(rows);
    });
});

app.post('/api/dados', (req, res) => {
    const { dispositivo, bpm, spo2 } = req.body;

    if (!dispositivo || bpm === undefined || spo2 === undefined) {
        return res.status(400).json({ erro: 'Dados incompletos enviados pelo ESP32' });
    }

    ultimaConexaoESP = Date.now();

    // Comando de interface
    if (bpm <= 0) {
        estadosUI[dispositivo] = { bpm, spo2 }; // Guarda estado temporário apenas na RAM
        console.log(`[UI] Disp: ${dispositivo} | Estado: ${bpm === 0 ? 'Sem dedo' : 'A calcular'}`);
        return res.status(201).json({ status: 'Estado da interface atualizado' });
    }

    // Leitura real
    estadosUI[dispositivo] = { bpm, spo2 }; 
    const query = `INSERT INTO leituras (dispositivo, bpm, spo2) VALUES (?, ?, ?)`;
    db.run(query, [dispositivo, bpm, spo2], function(err) {
        if (err) return res.status(500).json({ erro: err.message });
        
        console.log(`[IoT Saúde] Disp: ${dispositivo} | BPM: ${bpm} | SpO2: ${spo2}%`);
        res.status(201).json({ status: 'Sucesso', leituraId: this.lastID });
    });
});

app.delete('/api/pacientes/:id', (req, res) => {
    const { id } = req.params;
    db.run(`DELETE FROM pacientes WHERE id = ?`, id, function(err) {
        if (err) return res.status(500).json({ erro: err.message });
        res.json({ mensagem: 'Paciente removido com sucesso', linhasAfetadas: this.changes });
    });
});

app.post('/api/dados', (req, res) => {
    const { dispositivo, bpm, spo2 } = req.body;

    if (!dispositivo || bpm === undefined || spo2 === undefined) {
        return res.status(400).json({ erro: 'Dados incompletos enviados pelo ESP32' });
    }

    const query = `INSERT INTO leituras (dispositivo, bpm, spo2) VALUES (?, ?, ?)`;
    db.run(query, [dispositivo, bpm, spo2], function(err) {
        if (err) return res.status(500).json({ erro: err.message });
        
        ultimaConexaoESP = Date.now();

        console.log(`[IoT Recebido] Disp: ${dispositivo} | BPM: ${bpm} | SpO2: ${spo2}%`);
        res.status(201).json({ status: 'Sucesso', leituraId: this.lastID });
    });
});

app.get('/api/dados/ultimo/:dispositivo', (req, res) => {
    const { dispositivo } = req.params;
    
    // Verifica se a placa está num estado visual
    if (estadosUI[dispositivo] && estadosUI[dispositivo].bpm <= 0) {
        return res.json(estadosUI[dispositivo]); // Entrega o 0 ou -1 diretamente ao site
    }
    
    // Caso contrário, busca a leitura real mais recente
    const query = `SELECT * FROM leituras WHERE dispositivo = ? ORDER BY id DESC LIMIT 1`;
    db.get(query, [dispositivo], (err, row) => {
        if (err) return res.status(500).json({ erro: err.message });
        res.json(row || { bpm: 0, spo2: 0 });
    });
});

app.get('/api/relatorios/geral', (req, res) => {
    const query = `SELECT * FROM leituras ORDER BY id DESC LIMIT 100`;
    db.all(query, [], (err, rows) => {
        if (err) return res.status(500).json({ erro: err.message });
        res.json(rows);
    });
});

app.get('/api/relatorios/individual/:dispositivo', (req, res) => {
    const { dispositivo } = req.params;
    const query = `SELECT * FROM leituras WHERE dispositivo = ? ORDER BY id DESC LIMIT 100`;
    db.all(query, [dispositivo], (err, rows) => {
        if (err) return res.status(500).json({ erro: err.message });
        res.json(rows);
    });
});

app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}! Acesse http://localhost:${PORT}`);
});
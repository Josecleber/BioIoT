
const sqlite3 = require('sqlite3').verbose();
const assert = require('node:assert/strict');

// Banco temporário em memória.
// Não acessa o banco real do BioIoT.
const db = new sqlite3.Database(':memory:');

function executar(sql, parametros = []) {
    return new Promise((resolve, reject) => {
        db.run(sql, parametros, function (erro) {
            if (erro) return reject(erro);

            resolve({
                id: this.lastID,
                alteracoes: this.changes
            });
        });
    });
}

function consultar(sql, parametros = []) {
    return new Promise((resolve, reject) => {
        db.get(sql, parametros, (erro, registro) => {
            if (erro) return reject(erro);
            resolve(registro);
        });
    });
}

async function testar() {
    await executar(`
        CREATE TABLE alarmes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            paciente_id INTEGER NOT NULL,
            dispositivo TEXT NOT NULL,
            sessao_id TEXT NOT NULL,
            nivel TEXT NOT NULL,
            motivo TEXT NOT NULL,
            bpm INTEGER NOT NULL,
            spo2 INTEGER NOT NULL,
            leitura_id INTEGER,
            status TEXT NOT NULL DEFAULT 'ativo',
            inicio DATETIME DEFAULT CURRENT_TIMESTAMP,
            encerramento DATETIME
        )
    `);

    const novoAlarme = await executar(`
        INSERT INTO alarmes (
            paciente_id, dispositivo, sessao_id,
            nivel, motivo, bpm, spo2, leitura_id
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [
        999,
        'ESP32-TESTE',
        'SESSAO-TESTE',
        'critico',
        'BPM muito elevado',
        130,
        98,
        1001
    ]);

    assert.equal(novoAlarme.id, 1);
    console.log('OK - Alarme registrado no banco temporário');

    const alarmeAtivo = await consultar(
        'SELECT * FROM alarmes WHERE id = ?',
        [novoAlarme.id]
    );

    assert.equal(alarmeAtivo.status, 'ativo');
    assert.equal(alarmeAtivo.paciente_id, 999);
    assert.equal(alarmeAtivo.bpm, 130);

    console.log('OK - Dados do alarme preservados');

    await executar(`
        UPDATE alarmes
        SET status = 'encerrado',
            encerramento = CURRENT_TIMESTAMP
        WHERE id = ? AND status = 'ativo'
    `, [novoAlarme.id]);

    const alarmeEncerrado = await consultar(
        'SELECT * FROM alarmes WHERE id = ?',
        [novoAlarme.id]
    );

    assert.equal(alarmeEncerrado.status, 'encerrado');
    assert.ok(alarmeEncerrado.encerramento);

    console.log('OK - Alarme encerrado corretamente');

    const total = await consultar(
        'SELECT COUNT(*) AS total FROM alarmes'
    );

    assert.equal(total.total, 1);

    console.log('OK - Histórico preservado após encerramento');
    console.log('\nTODOS OS TESTES DO BANCO PASSARAM!');
}

testar()
    .catch(erro => {
        console.error('FALHA:', erro);
        process.exitCode = 1;
    })
    .finally(() => db.close());

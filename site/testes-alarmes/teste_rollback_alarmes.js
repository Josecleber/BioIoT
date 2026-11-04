
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const sqlite3 = require('sqlite3').verbose();

const db = new sqlite3.Database(':memory:');

function executar(sql, parametros = []) {
    return new Promise((resolve, reject) => {
        db.run(sql, parametros, function (erro) {
            if (erro) return reject(erro);
            resolve(this);
        });
    });
}

function consultar(sql) {
    return new Promise((resolve, reject) => {
        db.get(sql, (erro, registro) => {
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
            nivel TEXT NOT NULL CHECK (nivel = 'atencao'),
            motivo TEXT NOT NULL,
            bpm INTEGER NOT NULL,
            spo2 INTEGER NOT NULL,
            leitura_id INTEGER,
            status TEXT NOT NULL DEFAULT 'ativo',
            inicio DATETIME DEFAULT CURRENT_TIMESTAMP,
            encerramento DATETIME
        )
    `);

    await executar(`
        INSERT INTO alarmes (
            paciente_id, dispositivo, sessao_id,
            nivel, motivo, bpm, spo2, leitura_id
        )
        VALUES (999, 'ESP32-TESTE', 'SESSAO-TESTE',
                'atencao', 'BPM elevado', 110, 98, 1001)
    `);

    const servidor = fs.readFileSync(
        path.join(__dirname, '..', 'server.js'),
        'utf8'
    );

    const inicio = servidor.indexOf(
        'const filaSubstituicaoAlarmes = []'
    );

    const fim = servidor.indexOf(
        'function registrarAlarmeConfirmado(',
        inicio
    );

    if (inicio < 0 || fim < 0) {
        throw new Error('Função não encontrada no servidor.');
    }

    const mensagens = [];


    const contexto = vm.createContext({
        db,
        dbAlarmes: db,

        sessoesEmMonitoramento: new Map([
            ['ESP32-TESTE', 'SESSAO-TESTE']
        ]),

        pacientesEmMonitoramento: new Map([
            ['ESP32-TESTE', 999]
        ]),

        dispositivosEncerrandoMonitoramento: new Set(),

        console: {
            log: (...args) => mensagens.push(args.join(' ')),
            warn: (...args) => mensagens.push(args.join(' ')),
            error: (...args) => mensagens.push(args.join(' '))
        }
    });

    vm.runInContext(
        servidor.slice(inicio, fim) +
        '\nthis.substituir = substituirAlarmeAtivo;',
        contexto
    );

    contexto.substituir({
        pacienteId: 999,
        dispositivo: 'ESP32-TESTE',
        sessaoId: 'SESSAO-TESTE',
        nivel: 'critico',
        bpm: 130,
        spo2: 98,
        leituraId: 1002
    });

    // Aguarda a mensagem de falha emitida após o ROLLBACK.
    const limite = Date.now() + 3000;

    while (
        !mensagens.some(msg => msg.includes('Gravação cancelada')) &&
        Date.now() < limite
    ) {
        await new Promise(resolve => setTimeout(resolve, 10));
    }

    assert.ok(
        mensagens.some(msg => msg.includes('Gravação cancelada')),
        'A falha de inserção não foi observada.'
    );

    const registro = await consultar(
        'SELECT * FROM alarmes WHERE leitura_id = 1001'
    );

    assert.equal(registro.status, 'ativo');
    assert.equal(registro.encerramento, null);

    const total = await consultar(
        'SELECT COUNT(*) AS total FROM alarmes'
    );

    assert.equal(total.total, 1);

    console.log('OK - Inserção crítica rejeitada');
    console.log('OK - ROLLBACK preservou o alerta anterior');
    console.log('OK - Nenhum registro adicional foi criado');
    console.log('\nTESTE DE ROLLBACK APROVADO!');
}

testar()
    .catch(erro => {
        console.error('FALHA:', erro);
        process.exitCode = 1;
    })
    .finally(() => db.close());

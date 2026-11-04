
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

    assert.ok(inicio >= 0 && fim > inicio);

    const mensagens = [];


    const contexto = vm.createContext({
        dbAlarmes: db,

        sessoesEmMonitoramento: new Map([
            ['ESP32-TESTE', 'SESSAO-CONCORRENCIA']
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
        '\nthis.substituir = substituirAlarmeAtivo;' +
        '\nthis.estadoFila = () => ({' +
        'pendentes: filaSubstituicaoAlarmes.length,' +
        'ocupada: substituicaoAlarmeEmAndamento' +
        '});',
        contexto
    );

    contexto.substituir({
        pacienteId: 999,
        dispositivo: 'ESP32-TESTE',
        sessaoId: 'SESSAO-CONCORRENCIA',
        nivel: 'atencao',
        bpm: 110,
        spo2: 98,
        leituraId: 3001
    });

    contexto.substituir({
        pacienteId: 999,
        dispositivo: 'ESP32-TESTE',
        sessaoId: 'SESSAO-CONCORRENCIA',
        nivel: 'critico',
        bpm: 130,
        spo2: 98,
        leituraId: 3002
    });

    // Aguarda o COMMIT das duas operações.
    const limite = Date.now() + 3000;

    while (
        contexto.estadoFila().ocupada ||
        contexto.estadoFila().pendentes > 0
    ) {
        if (Date.now() > limite) {
            throw new Error('Fila não foi concluída.');
        }

        await new Promise(resolve => setTimeout(resolve, 10));
    }

    const anterior = await consultar(
        'SELECT * FROM alarmes WHERE leitura_id = 3001'
    );

    const atual = await consultar(
        'SELECT * FROM alarmes WHERE leitura_id = 3002'
    );

    assert.ok(anterior);
    assert.ok(atual);
    assert.equal(anterior.status, 'encerrado');
    assert.equal(atual.status, 'ativo');

    const ativos = await consultar(`
        SELECT COUNT(*) AS total
        FROM alarmes
        WHERE status = 'ativo'
    `);

    assert.equal(ativos.total, 1);

    assert.equal(
        mensagens.filter(m => m.includes('Nova ocorrência confirmada')).length,
        2
    );

    console.log('OK - Duas substituições processadas');
    console.log('OK - Primeiro alerta encerrado');
    console.log('OK - Último alerta permaneceu ativo');
    console.log('OK - Apenas um alerta ativo');
    console.log('\nTESTE DE CONCORRENCIA APROVADO!');
}

testar()
    .catch(erro => {
        console.error('FALHA:', erro);
        process.exitCode = 1;
    })
    .finally(() => db.close());

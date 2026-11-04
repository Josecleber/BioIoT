
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
            resolve(this.changes);
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
        'function encerrarAlarmesNormalizados('
    );

    const fim = servidor.indexOf(
        'const confirmacoesAlarmesServidor = new Map();',
        inicio
    );

    if (inicio === -1 || fim === -1) {
        throw new Error('Funções de alarmes não encontradas.');
    }


    const contexto = vm.createContext({
        db,
        dbAlarmes: db,
        setImmediate,

        sessoesEmMonitoramento: new Map([
            ['ESP32-TESTE', 'SESSAO-A']
        ]),

        pacientesEmMonitoramento: new Map([
            ['ESP32-TESTE', 999]
        ]),

        dispositivosEncerrandoMonitoramento: new Set(),

        console
    });

    vm.runInContext(
        servidor.slice(inicio, fim) + `
            this.registrar = registrarAlarmeConfirmado;
            this.substituir = substituirAlarmeAtivo;
            this.normalizar = encerrarAlarmesNormalizados;
            this.interromper = interromperAlarmesDaSessao;
            this.encerrar = encerrarAlarmesDaSessao;

this.aguardarFila = function (callback) {
    function verificar() {
        if (
            !substituicaoAlarmeEmAndamento &&
            filaSubstituicaoAlarmes.length === 0
        ) {
            callback();
            return;
        }

        setImmediate(verificar);
    }

    verificar();
};
        `,
        contexto
    );

    function aguardarFila() {
        return new Promise(resolve => {
            contexto.aguardarFila(resolve);
        });
    }

    async function criarAlarme(sessaoId, leituraId) {
        contexto.sessoesEmMonitoramento.set(
            'ESP32-TESTE',
            sessaoId
        );

        contexto.registrar({
            pacienteId: 999,
            dispositivo: 'ESP32-TESTE',
            sessaoId,
            nivel: 'critico',
            bpm: 130,
            spo2: 98,
            leituraId
        });

        await aguardarFila();

        return consultar(
            `SELECT * FROM alarmes
             WHERE leitura_id = ${leituraId}`
        );
    }

    const primeiro = await criarAlarme('SESSAO-A', 1001);

    assert.ok(primeiro);
    assert.equal(primeiro.status, 'ativo');
    assert.equal(primeiro.paciente_id, 999);
    console.log('OK - Função real registrou o alarme');

    contexto.normalizar('ESP32-TESTE', 'SESSAO-A');

    const normalizado = await consultar(
        'SELECT * FROM alarmes WHERE leitura_id = 1001'
    );

    assert.equal(normalizado.status, 'encerrado');
    console.log('OK - Função real normalizou o alarme');

    await criarAlarme('SESSAO-B', 1002);

    contexto.interromper('ESP32-TESTE', 'SESSAO-B');

    const interrompido = await consultar(
        'SELECT * FROM alarmes WHERE leitura_id = 1002'
    );

    assert.equal(interrompido.status, 'interrompido');
    console.log('OK - Função real interrompeu o alarme');

    await criarAlarme('SESSAO-C', 1003);

    contexto.encerrar('ESP32-TESTE', 'SESSAO-C');

    const encerrado = await consultar(
        'SELECT * FROM alarmes WHERE leitura_id = 1003'
    );

    assert.equal(encerrado.status, 'encerrado');
    assert.ok(encerrado.encerramento);
    console.log('OK - Função real encerrou a sessão');

    const historico = await consultar(
        'SELECT COUNT(*) AS total FROM alarmes'
    );

    assert.equal(historico.total, 3);
    console.log('OK - Histórico preservou os três alertas');

    contexto.sessoesEmMonitoramento.set(
        'ESP32-TESTE',
        'SESSAO-TRANSICAO'
    );

    contexto.pacientesEmMonitoramento.set(
        'ESP32-TESTE',
        999
    );

    contexto.registrar({
        pacienteId: 999,
        dispositivo: 'ESP32-TESTE',
        sessaoId: 'SESSAO-TRANSICAO',
        nivel: 'atencao',
        bpm: 110,
        spo2: 98,
        leituraId: 2001
    });

    // Garante que a primeira gravação foi processada.
    const atencao = await consultar(
        `SELECT * FROM alarmes WHERE leitura_id = 2001`
    );

    assert.ok(atencao);
    assert.equal(atencao.status, 'ativo');

    contexto.substituir({
        pacienteId: 999,
        dispositivo: 'ESP32-TESTE',
        sessaoId: 'SESSAO-TRANSICAO',
        nivel: 'critico',
        bpm: 130,
        spo2: 98,
        leituraId: 2002
    });

    await new Promise((resolve, reject) => {
        db.get('SELECT 1', erro => {
            if (erro) reject(erro);
            else resolve();
        });
    });

    const atencaoAnterior = await consultar(
        `SELECT * FROM alarmes WHERE leitura_id = 2001`
    );

    const criticoNovo = await consultar(
        `SELECT * FROM alarmes WHERE leitura_id = 2002`
    );

    assert.equal(atencaoAnterior.status, 'encerrado');
    assert.equal(criticoNovo.status, 'ativo');

    const ativos = await consultar(`
        SELECT COUNT(*) AS total
        FROM alarmes
        WHERE dispositivo = 'ESP32-TESTE'
          AND sessao_id = 'SESSAO-TRANSICAO'
          AND status = 'ativo'
    `);

    assert.equal(ativos.total, 1);

    console.log(
        'OK - Atenção encerrada e crítico ativado sem duplicação'
    );

    console.log('\nTODOS OS TESTES DE INTEGRACAO PASSARAM!');
}

testar()
    .catch(erro => {
        console.error('FALHA:', erro);
        process.exitCode = 1;
    })
    .finally(() => db.close());

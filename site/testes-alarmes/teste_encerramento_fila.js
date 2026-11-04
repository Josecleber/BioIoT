
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const sqlite3 = require('sqlite3').verbose();

const db = new sqlite3.Database(':memory:');

function executar(sql) {
    return new Promise((resolve, reject) => {
        db.run(sql, erro => {
            if (erro) reject(erro);
            else resolve();
        });
    });
}

function consultar(sql, parametros = []) {
    return new Promise((resolve, reject) => {
        db.get(sql, parametros, (erro, registro) => {
            if (erro) reject(erro);
            else resolve(registro);
        });
    });
}

async function aguardarFila(contexto) {
    const limite = Date.now() + 3000;

    while (true) {
        const estado = contexto.estadoFila();

        if (!estado.ocupada && estado.pendentes === 0) {
            return;
        }

        if (Date.now() > limite) {
            throw new Error('A fila não terminou em 3 segundos.');
        }

        await new Promise(resolve => setTimeout(resolve, 10));
    }
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

    const codigo = fs.readFileSync(
        path.join(__dirname, '..', 'server.js'),
        'utf8'
    );

    const inicio = codigo.indexOf(
        'function encerrarAlarmesNormalizados('
    );

    const fim = codigo.indexOf(
        'function registrarAlarmeConfirmado(',
        inicio
    );

    assert.ok(inicio >= 0 && fim > inicio);

    const erros = [];


    const sessoesEmMonitoramento = new Map([
        ['ESP32-TESTE', 'SESSAO-ENCERRADA']
    ]);

    const pacientesEmMonitoramento = new Map([
        ['ESP32-TESTE', 999]
    ]);

    const dispositivosEncerrandoMonitoramento = new Set();

    const contexto = vm.createContext({
        dbAlarmes: db,
        sessoesEmMonitoramento,
        pacientesEmMonitoramento,
        dispositivosEncerrandoMonitoramento,

        console: {
            log: () => { },
            warn: () => { },
            error: (...args) => erros.push(args.join(' '))
        }
    });

    vm.runInContext(
        codigo.slice(inicio, fim) + `
            this.registrar = substituirAlarmeAtivo;
            this.normalizar = encerrarAlarmesNormalizados;
            this.interromper = interromperAlarmesDaSessao;
            this.encerrar = encerrarAlarmesDaSessao;

            this.estadoFila = () => ({
                pendentes: filaSubstituicaoAlarmes.length,
                ocupada: substituicaoAlarmeEmAndamento
            });
        `,
        contexto
    );

    async function testarCenario(sessaoId, leituraId, tipo, esperado) {
        const dispositivo = 'ESP32-TESTE';

        sessoesEmMonitoramento.set(dispositivo, sessaoId);
        pacientesEmMonitoramento.set(dispositivo, 999);

        contexto.registrar({
            pacienteId: 999,
            dispositivo,
            sessaoId,
            nivel: 'critico',
            bpm: 130,
            spo2: 98,
            leituraId
        });

        // Enfileira o encerramento imediatamente,
        // antes de a gravação anterior terminar.
        if (tipo === 'encerrar') {
            await new Promise((resolve, reject) => {
                contexto.encerrar(
                    dispositivo,
                    sessaoId,
                    erro => erro ? reject(erro) : resolve()
                );
            });
        } else if (tipo === 'interromper') {
            contexto.interromper(dispositivo, sessaoId);
        } else {
            contexto.normalizar(dispositivo, sessaoId);
        }

        await aguardarFila(contexto);

        const registro = await consultar(
            'SELECT * FROM alarmes WHERE leitura_id = ?',
            [leituraId]
        );

        assert.ok(registro, 'O alarme não foi registrado.');
        assert.equal(registro.status, esperado);
        assert.ok(registro.encerramento);

        const ativos = await consultar(
            `SELECT COUNT(*) AS total
             FROM alarmes
             WHERE sessao_id = ?
               AND status = 'ativo'`,
            [sessaoId]
        );

        assert.equal(ativos.total, 0);
    }

    await testarCenario(
        'SESSAO-ENCERRADA', 4001,
        'encerrar', 'encerrado'
    );
    console.log('OK - Encerramento aguardou o registro');

    await testarCenario(
        'SESSAO-INTERROMPIDA', 4002,
        'interromper', 'interrompido'
    );
    console.log('OK - Dedo removido interrompeu o alerta');

    await testarCenario(
        'SESSAO-NORMALIZADA', 4003,
        'normalizar', 'encerrado'
    );
    console.log('OK - Normalização encerrou o alerta');


    // Teste de segurança: registro atrasado após encerrar sessão.
    contexto.registrar({
        pacienteId: 999,
        dispositivo: 'ESP32-TESTE',
        sessaoId: 'SESSAO-ENCERRADA',
        nivel: 'critico',
        bpm: 130,
        spo2: 98,
        leituraId: 4004
    });

    await aguardarFila(contexto);

    const atrasados = await consultar(`
        SELECT COUNT(*) AS total
        FROM alarmes
        WHERE sessao_id = 'SESSAO-ENCERRADA'
          AND status = 'ativo'
    `);

    assert.equal(
        atrasados.total,
        0,
        'Uma sessão encerrada não pode receber novos alarmes ativos.'
    );

    console.log('OK - Registro atrasado foi bloqueado');


    // Simula uma nova sessão no mesmo ESP32.
    sessoesEmMonitoramento.set(
        'ESP32-TESTE',
        'SESSAO-NOVA'
    );

    // Um novo paciente assume o monitoramento.
    pacientesEmMonitoramento.set(
        'ESP32-TESTE',
        888
    );

    // Tenta registrar um alarme da sessão antiga.
    contexto.registrar({
        pacienteId: 999,
        dispositivo: 'ESP32-TESTE',
        sessaoId: 'SESSAO-ENCERRADA',
        nivel: 'critico',
        bpm: 130,
        spo2: 98,
        leituraId: 4005
    });

    await aguardarFila(contexto);

    const antigo = await consultar(
        'SELECT COUNT(*) AS total FROM alarmes WHERE leitura_id = ?',
        [4005]
    );

    assert.equal(antigo.total, 0);
    console.log('OK - Sessão antiga não registrou alarme');

    // Confirma que a nova sessão pode registrar normalmente.
    contexto.registrar({
        pacienteId: 888,
        dispositivo: 'ESP32-TESTE',
        sessaoId: 'SESSAO-NOVA',
        nivel: 'critico',
        bpm: 130,
        spo2: 98,
        leituraId: 4006
    });

    await aguardarFila(contexto);

    const novo = await consultar(
        'SELECT * FROM alarmes WHERE leitura_id = ?',
        [4006]
    );

    assert.ok(novo);
    assert.equal(novo.paciente_id, 888);
    assert.equal(novo.sessao_id, 'SESSAO-NOVA');
    assert.equal(novo.status, 'ativo');

    console.log('OK - Nova sessão registrou alarme corretamente');


    // Teste: encerramento solicitado durante uma transação.
    const sessaoDuranteTransacao = 'SESSAO-DURANTE-TRANSACAO';

    sessoesEmMonitoramento.set(
        'ESP32-TESTE',
        sessaoDuranteTransacao
    );
    pacientesEmMonitoramento.set('ESP32-TESTE', 999);

    const executarOriginal = db.run;
    let interceptouInsercao = false;
    let promessaEncerramento;

    try {
        // Intercepta a inserção somente no banco temporário.
        db.run = function (sql, ...argumentos) {
            if (
                !interceptouInsercao &&
                /^\s*INSERT INTO alarmes\b/i.test(sql)
            ) {
                interceptouInsercao = true;

                // Solicita encerramento enquanto a transação
                // ainda não executou o COMMIT.
                promessaEncerramento = new Promise((resolve, reject) => {
                    contexto.encerrar(
                        'ESP32-TESTE',
                        sessaoDuranteTransacao,
                        erro => erro ? reject(erro) : resolve()
                    );
                });
            }

            return executarOriginal.call(this, sql, ...argumentos);
        };

        contexto.registrar({
            pacienteId: 999,
            dispositivo: 'ESP32-TESTE',
            sessaoId: sessaoDuranteTransacao,
            nivel: 'critico',
            bpm: 130,
            spo2: 98,
            leituraId: 6001
        });

        await aguardarFila(contexto);

        assert.ok(
            interceptouInsercao,
            'A inserção não foi interceptada.'
        );

        await promessaEncerramento;

        const registro = await consultar(
            'SELECT * FROM alarmes WHERE leitura_id = ?',
            [6001]
        );

        assert.ok(registro);
        assert.equal(registro.status, 'encerrado');
        assert.ok(registro.encerramento);

        console.log(
            'OK - Encerramento durante transação foi processado'
        );
        console.log(
            'OK - Alarme não permaneceu ativo após encerramento'
        );
    } finally {
        db.run = executarOriginal;
    }

    assert.deepEqual(erros, []);

    await executar(`
        CREATE TRIGGER bloquear_encerramento_teste
        BEFORE UPDATE ON alarmes
        WHEN NEW.status = 'encerrado'
        BEGIN
            SELECT RAISE(ABORT, 'Falha simulada no encerramento');
        END
    `);

    const sessaoFalha = 'SESSAO-FALHA-ENCERRAMENTO';

    // Prepara um alerta ativo no banco de teste.
    await executar(`
        INSERT INTO alarmes (
            paciente_id, dispositivo, sessao_id,
            nivel, motivo, bpm, spo2, leitura_id
        )
        VALUES (
            999, 'ESP32-TESTE', 'SESSAO-FALHA-ENCERRAMENTO',
            'critico', 'Teste de falha', 130, 98, 5001
        )
    `);

    // Simula uma sessão ativa.
    sessoesEmMonitoramento.set('ESP32-TESTE', sessaoFalha);
    pacientesEmMonitoramento.set('ESP32-TESTE', 999);

    const erroEncerramento = await new Promise(resolve => {
        contexto.encerrar(
            'ESP32-TESTE',
            sessaoFalha,
            erro => resolve(erro)
        );
    });

    assert.ok(
        erroEncerramento,
        'O erro de encerramento deveria ser informado.'
    );

    await aguardarFila(contexto);

    const alertaPreservado = await consultar(
        'SELECT * FROM alarmes WHERE leitura_id = ?',
        [5001]
    );

    assert.equal(alertaPreservado.status, 'ativo');
    assert.equal(alertaPreservado.encerramento, null);

    await executar('DROP TRIGGER bloquear_encerramento_teste');

    console.log('OK - Falha de encerramento foi identificada');
    console.log('OK - Alerta anterior permaneceu ativo');
    console.log('OK - Erro foi encaminhado ao callback');

    console.log('OK - Nenhum alarme permaneceu ativo');
    console.log('\nTESTE DE ENCERRAMENTO DA FILA APROVADO!');
}

testar()
    .catch(erro => {
        console.error('FALHA:', erro);
        process.exitCode = 1;
    })
    .finally(() => db.close());

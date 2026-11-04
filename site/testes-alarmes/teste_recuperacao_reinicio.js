
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const sqlite3 = require('sqlite3').verbose();

const db = new sqlite3.Database(':memory:');

function executar(sql, parametros = []) {
    return new Promise((resolve, reject) => {
        db.run(sql, parametros, function (erro) {
            if (erro) reject(erro);
            else resolve(this);
        });
    });
}

function consultar(sql) {
    return new Promise((resolve, reject) => {
        db.all(sql, (erro, linhas) => {
            if (erro) reject(erro);
            else resolve(linhas);
        });
    });
}

async function testar() {
    await executar(`
        CREATE TABLE alarmes (
            id INTEGER PRIMARY KEY,
            status TEXT NOT NULL,
            encerramento TEXT,
            motivo TEXT NOT NULL
        )
    `);

    await executar(`
        INSERT INTO alarmes
            (id, status, encerramento, motivo)
        VALUES
            (1, 'ativo', NULL, 'Alarme antigo A'),
            (2, 'ativo', NULL, 'Alarme antigo B'),
            (3, 'encerrado', '2026-01-01 10:00:00', 'Histórico'),
            (4, 'interrompido', '2026-01-01 11:00:00', 'Interrupção')
    `);

    const servidor = fs.readFileSync(
        path.join(__dirname, '..', 'server.js'),
        'utf8'
    );

    const padraoRecuperacao =
        /db\.run\s*\(\s*`UPDATE alarmes\s+SET status = 'interrompido'/;

    const correspondencia = padraoRecuperacao.exec(servidor);

    assert.ok(
        correspondencia,
        'Rotina de recuperação não encontrada no server.js'
    );

    const inicio = correspondencia.index;

    assert.ok(
        inicio >= 0,
        'Rotina de recuperação não encontrada no server.js'
    );

    const codigoInicializacao = servidor.slice(inicio);

    let iniciouServidor = false;
    let quantidadeRecuperada = null;

    const inicializacao = new Promise((resolve, reject) => {
        const contexto = {
            db,
            dbAlarmes: db,
            PORT: 3000,
            process: { exitCode: 0 },
            console: {
                log: mensagem => {
                    const correspondencia = String(mensagem).match(
                        /Ocorrências interrompidas:\s*(\d+)/
                    );

                    if (correspondencia) {
                        quantidadeRecuperada = Number(correspondencia[1]);
                    }
                },
                error: (...args) => reject(new Error(args.join(' ')))
            },
            app: {
                listen: (porta, callback) => {
                    iniciouServidor = true;
                    try {
                        assert.equal(porta, 3000);
                        callback();
                        resolve();
                    } catch (erro) {
                        reject(erro);
                    }
                }
            }
        };

        vm.runInNewContext(
            codigoInicializacao,
            contexto,
            { timeout: 1000 }
        );
    });

    assert.equal(
        iniciouServidor,
        false,
        'Servidor iniciou antes de concluir a recuperação'
    );

    await inicializacao;

    const linhas = await consultar(
        'SELECT * FROM alarmes ORDER BY id'
    );

    assert.equal(quantidadeRecuperada, 2);

    for (const linha of linhas.slice(0, 2)) {
        assert.equal(linha.status, 'interrompido');
        assert.ok(linha.encerramento);
    }

    assert.equal(linhas[2].status, 'encerrado');
    assert.equal(linhas[2].encerramento, '2026-01-01 10:00:00');

    assert.equal(linhas[3].status, 'interrompido');
    assert.equal(linhas[3].encerramento, '2026-01-01 11:00:00');

    assert.equal(linhas[0].motivo, 'Alarme antigo A');
    assert.equal(linhas[1].motivo, 'Alarme antigo B');

    console.log('OK - Dois alarmes antigos interrompidos');
    console.log('OK - Horários anteriores preservados');
    console.log('OK - Motivos dos alarmes preservados');
    console.log('OK - Servidor iniciou após recuperação');
    console.log('');
    console.log('TESTE DE RECUPERACAO APROVADO!');
}

testar()
    .catch(erro => {
        console.error('FALHA:', erro.message);
        process.exitCode = 1;
    })
    .finally(() => {
        db.close();
    });

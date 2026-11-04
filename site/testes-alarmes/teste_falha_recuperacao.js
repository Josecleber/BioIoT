
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const servidor = fs.readFileSync(
    path.join(__dirname, '..', 'server.js'),
    'utf8'
);

const padrao =
    /db\.run\s*\(\s*`UPDATE alarmes\s+SET status = 'interrompido'/;

const encontrado = padrao.exec(servidor);

assert.ok(
    encontrado,
    'Rotina de recuperação não encontrada'
);

const codigo = servidor.slice(encontrado.index);

let servidorIniciado = false;
let bancoPrincipalFechado = false;
let bancoAlarmesFechado = false;
let erroRegistrado = false;

const processoSimulado = { exitCode: 0 };

const db = {
    run(sql, callback) {
        // Simula um erro de SQLite, sem acessar o banco real.
        setImmediate(() => {
            callback(new Error('Falha simulada no SQLite'));
        });
    },

    close() {
        bancoPrincipalFechado = true;
    }
};

const dbAlarmes = {
    close() {
        bancoAlarmesFechado = true;
    }
};

const app = {
    listen() {
        servidorIniciado = true;
    }
};

const resultado = new Promise((resolve, reject) => {
    const contexto = {
        db,
        dbAlarmes,
        app,
        PORT: 3000,
        process: processoSimulado,
        console: {
            log() { },
            error(...args) {
                erroRegistrado = true;
                resolve(args.join(' '));
            }
        }
    };

    try {
        vm.runInNewContext(codigo, contexto, {
            timeout: 1000
        });
    } catch (erro) {
        reject(erro);
    }
});

async function testar() {
    const mensagem = await resultado;

    assert.match(mensagem, /Falha simulada no SQLite/);
    assert.equal(erroRegistrado, true);
    assert.equal(processoSimulado.exitCode, 1);
    assert.equal(servidorIniciado, false);
    assert.equal(bancoPrincipalFechado, true);
    assert.equal(bancoAlarmesFechado, true);

    console.log('OK - Falha do SQLite identificada');
    console.log('OK - Código de saída definido como erro');
    console.log('OK - Servidor não iniciou');
    console.log('OK - Conexões SQLite receberam fechamento');
    console.log('');
    console.log('TESTE DE FALHA NA RECUPERACAO APROVADO!');
}

testar().catch(erro => {
    console.error('FALHA:', erro.message);
    process.exitCode = 1;
});

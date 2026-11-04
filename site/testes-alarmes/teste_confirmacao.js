
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const codigoServidor = fs.readFileSync(
    path.join(__dirname, '..', 'server.js'),
    'utf8'
);

// Extrai apenas a lógica de classificação e confirmação,
// sem executar o servidor ou acessar o banco real.
const inicio = codigoServidor.indexOf(
    'const confirmacoesAlarmesServidor = new Map();'
);

const fim = codigoServidor.indexOf(
    "app.post('/api/dados'",
    inicio
);

if (inicio < 0 || fim < 0) {
    throw new Error('Funções de alarme não encontradas.');
}

const trecho = codigoServidor.slice(inicio, fim);

const contexto = vm.createContext({ Map });

vm.runInContext(
    trecho + '\nthis.confirmar = confirmarAlarmeServidor;',
    contexto
);

const confirmar = contexto.confirmar;

let proximoId = 0;

function leitura(bpm, spo2) {
    proximoId++;

    return confirmar(
        'ESP32-TESTE',
        999,
        'SESSAO-TESTE',
        proximoId,
        bpm,
        spo2
    );
}

function verificar(descricao, recebido, esperado) {
    if (recebido !== esperado) {
        throw new Error(
            `${descricao}: esperado ${esperado}, recebido ${recebido}`
        );
    }

    console.log(`OK - ${descricao}`);
}

verificar('Primeira crítica', leitura(130, 98), null);
verificar('Segunda crítica', leitura(128, 98), null);
verificar('Terceira crítica', leitura(125, 98), 'critico');
verificar('Quarta crítica sem duplicar', leitura(130, 98), null);

verificar('Primeira normal', leitura(80, 99), null);
verificar('Segunda normal', leitura(82, 99), null);
verificar('Terceira normal', leitura(79, 99), 'normalizado');


function leituraDePaciente(
    pacienteId,
    sessaoId,
    leituraId,
    bpm,
    spo2
) {
    return confirmar(
        'ESP32-TESTE',
        pacienteId,
        sessaoId,
        leituraId,
        bpm,
        spo2
    );
}

// Teste: uma nova sessão não pode herdar
// as confirmações da sessão anterior.
verificar(
    'Primeira crítica da sessão A',
    leituraDePaciente(101, 'SESSAO-A', 1001, 130, 98),
    null
);

verificar(
    'Segunda crítica da sessão A',
    leituraDePaciente(101, 'SESSAO-A', 1002, 130, 98),
    null
);

verificar(
    'Nova sessão reinicia a confirmação',
    leituraDePaciente(101, 'SESSAO-B', 1003, 130, 98),
    null
);

// Teste: um paciente diferente não pode
// herdar a confirmação do paciente anterior.
verificar(
    'Novo paciente reinicia a confirmação',
    leituraDePaciente(202, 'SESSAO-C', 1004, 130, 98),
    null
);

// Teste: uma leitura repetida não conta novamente.
verificar(
    'Leitura repetida é ignorada',
    leituraDePaciente(202, 'SESSAO-C', 1004, 130, 98),
    null
);


// Teste de transição entre atenção e crítico.
// Usa uma sessão fictícia, sem acessar o banco real.

verificar(
    'Primeira atenção',
    leituraDePaciente(303, 'SESSAO-TRANSICAO', 2001, 110, 98),
    null
);

verificar(
    'Segunda atenção',
    leituraDePaciente(303, 'SESSAO-TRANSICAO', 2002, 112, 98),
    null
);

verificar(
    'Terceira atenção confirma',
    leituraDePaciente(303, 'SESSAO-TRANSICAO', 2003, 115, 98),
    'atencao'
);

verificar(
    'Primeira crítica após atenção',
    leituraDePaciente(303, 'SESSAO-TRANSICAO', 2004, 130, 98),
    null
);

verificar(
    'Segunda crítica após atenção',
    leituraDePaciente(303, 'SESSAO-TRANSICAO', 2005, 132, 98),
    null
);

verificar(
    'Terceira crítica confirma',
    leituraDePaciente(303, 'SESSAO-TRANSICAO', 2006, 135, 98),
    'critico'
);

verificar(
    'Quarta crítica não duplica',
    leituraDePaciente(303, 'SESSAO-TRANSICAO', 2007, 130, 98),
    null
);

console.log('\nTODOS OS TESTES DE CONFIRMACAO PASSARAM!');


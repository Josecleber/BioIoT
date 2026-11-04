const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;
const { randomUUID } = require('crypto');

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


const dbAlarmes = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error(
            '[ALARME] Erro ao abrir conexão SQLite:',
            err.message
        );
    } else {
        console.log(
            '[ALARME] Conexão SQLite exclusiva iniciada.'
        );
    }
});

dbAlarmes.configure('busyTimeout', 5000);

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

    db.run(`CREATE TABLE IF NOT EXISTS alarmes (
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
        encerramento DATETIME,
        FOREIGN KEY (paciente_id) REFERENCES pacientes(id)
    )`);

    db.all('PRAGMA table_info(leituras)', [], (err, colunas) => {
        if (err) {
            console.error('Erro ao verificar estrutura de leituras:', err.message);
            return;
        }

        const possuiPacienteId = colunas.some(
            coluna => coluna.name === 'paciente_id'
        );

        if (!possuiPacienteId) {
            db.run(
                'ALTER TABLE leituras ADD COLUMN paciente_id INTEGER REFERENCES pacientes(id)',
                err => {
                    if (err) {
                        console.error('Erro na migração de pacientes:', err.message);
                    } else {
                        console.log('Coluna paciente_id adicionada à tabela leituras.');
                    }
                }
            );
        }
    });
});

let ultimaConexaoESP = null;
let estadosUI = {};

const pacientesEmMonitoramento = new Map();

const sessoesEmMonitoramento = new Map();

const sensoresComDedoRemovido = new Set();

const ultimaConfirmacaoSemDedo = new Map();

const ultimoEncerramentoMonitoramento = new Map();

const TEMPO_MAXIMO_SENSOR_LIVRE_MS = 15000;

const estatisticasComunicacao = {
    heartbeatsRecebidos: 0,
    medicoesRecebidas: 0,
    medicoesAceitas: 0,
    medicoesRejeitadas: 0,
    estadosInterface: 0,
    leiturasGravadas: 0,
    falhasBanco: 0,
    intervalosHeartbeatMs: [],
    ultimoHeartbeat: null
};

// Métricas reais do processo Node.js que executa o BioIoT
const os = require('os');

let cpuAnterior = process.cpuUsage();
let instanteAnterior = process.hrtime.bigint();

app.get('/api/desempenho', (req, res) => {
    const agora = process.hrtime.bigint();
    const cpuAtual = process.cpuUsage();

    const tempoDecorridoUs = Number(agora - instanteAnterior) / 1000;

    const cpuConsumidoUs =
        (cpuAtual.user - cpuAnterior.user) +
        (cpuAtual.system - cpuAnterior.system);

    // Percentual equivalente a um núcleo de CPU.
    const cpuPercentual = tempoDecorridoUs > 0
        ? (cpuConsumidoUs / tempoDecorridoUs) * 100
        : 0;

    cpuAnterior = cpuAtual;
    instanteAnterior = agora;

    const memoria = process.memoryUsage();

    res.json({
        timestamp: new Date().toISOString(),

        origem: 'Processo Node.js no container Docker',

        cpu: {
            percentual: Number(cpuPercentual.toFixed(2)),
            unidade: 'percentual de um nucleo'
        },

        memoria: {
            rssMB: Number((memoria.rss / 1024 / 1024).toFixed(2)),
            heapUsadoMB: Number((memoria.heapUsed / 1024 / 1024).toFixed(2)),
            heapTotalMB: Number((memoria.heapTotal / 1024 / 1024).toFixed(2))
        },

        sistema: {
            uptimeSegundos: Math.floor(process.uptime()),
            nucleosVisiveis: os.cpus().length,
            plataforma: process.platform,
            arquitetura: process.arch
        },

        esp32: {
            online: ultimaConexaoESP !== null &&
                Date.now() - ultimaConexaoESP < 10000,

            ultimaComunicacaoSegundos: ultimaConexaoESP === null
                ? null
                : Math.floor((Date.now() - ultimaConexaoESP) / 1000)
        }
    });
});

// Recebe periodicamente o sinal de vida do ESP32
app.post('/api/heartbeat', (req, res) => {
    const { dispositivo } = req.body;

    if (typeof dispositivo !== 'string' || !dispositivo.trim()) {
        return res.status(400).json({
            erro: 'Dispositivo não informado'
        });
    }

    const agoraHeartbeat = Date.now();

    if (estatisticasComunicacao.ultimoHeartbeat !== null) {
        const intervalo =
            agoraHeartbeat - estatisticasComunicacao.ultimoHeartbeat;

        estatisticasComunicacao.intervalosHeartbeatMs.push(intervalo);

        // Mantém os últimos 100 intervalos
        if (estatisticasComunicacao.intervalosHeartbeatMs.length > 100) {
            estatisticasComunicacao.intervalosHeartbeatMs.shift();
        }
    }

    estatisticasComunicacao.heartbeatsRecebidos++;
    estatisticasComunicacao.ultimoHeartbeat = agoraHeartbeat;
    ultimaConexaoESP = agoraHeartbeat;

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


app.get('/api/estatisticas-comunicacao', (req, res) => {
    const intervalos = estatisticasComunicacao.intervalosHeartbeatMs;

    const mediaIntervalo = intervalos.length
        ? intervalos.reduce((total, valor) => total + valor, 0) /
        intervalos.length
        : null;

    const maximoIntervalo = intervalos.length
        ? Math.max(...intervalos)
        : null;

    res.json({
        origem: 'Requisicoes recebidas pelo servidor BioIoT',

        inicioSessao: new Date(
            Date.now() - process.uptime() * 1000
        ).toISOString(),

        heartbeats: {
            recebidos: estatisticasComunicacao.heartbeatsRecebidos,
            ultimoRecebimento: estatisticasComunicacao.ultimoHeartbeat
                ? new Date(estatisticasComunicacao.ultimoHeartbeat).toISOString()
                : null,
            intervaloMedioMs: mediaIntervalo === null
                ? null
                : Number(mediaIntervalo.toFixed(2)),
            intervaloMaximoMs: maximoIntervalo,
            intervalosAnalisados: intervalos.length
        },

        medicoes: {
            recebidas: estatisticasComunicacao.medicoesRecebidas,
            aceitas: estatisticasComunicacao.medicoesAceitas,
            rejeitadas: estatisticasComunicacao.medicoesRejeitadas,
            estadosInterface: estatisticasComunicacao.estadosInterface,
            leiturasGravadas: estatisticasComunicacao.leiturasGravadas,
            falhasBanco: estatisticasComunicacao.falhasBanco
        },

        esp32: {
            online: ultimaConexaoESP !== null &&
                Date.now() - ultimaConexaoESP < 10000
        }
    });
});

app.post('/api/monitoramento/iniciar', (req, res) => {
    const pacienteId = Number(req.body?.pacienteId);

    if (!Number.isSafeInteger(pacienteId) || pacienteId <= 0) {
        return res.status(400).json({
            erro: 'ID do paciente inválido.'
        });
    }

    db.get(
        'SELECT id, nome, idade, dispositivo FROM pacientes WHERE id = ?',
        [pacienteId],
        (err, paciente) => {
            if (err) {
                return res.status(500).json({
                    erro: 'Erro ao consultar paciente.'
                });
            }

            if (!paciente) {
                return res.status(404).json({
                    erro: 'Paciente não encontrado.'
                });
            }


            const dispositivo = paciente.dispositivo;
            const pacienteAtualId = pacientesEmMonitoramento.get(dispositivo);

            // Impede trocar de paciente sem encerrar o monitoramento anterior.
            if (pacienteAtualId !== undefined) {
                if (pacienteAtualId === paciente.id) {
                    return res.json({
                        status: 'monitoramento_ja_ativo',
                        paciente
                    });
                }

                return res.status(409).json({
                    erro: 'Já existe um paciente em monitoramento neste ESP32. Encerre o monitoramento anterior antes de selecionar outra pessoa.'
                });
            }

            const agora = Date.now();
            const ultimaConfirmacao = ultimaConfirmacaoSemDedo.get(dispositivo);
            const ultimoEncerramento =
                ultimoEncerramentoMonitoramento.get(dispositivo) ?? 0;

            const confirmacaoRecente =
                ultimaConfirmacao !== undefined &&
                agora - ultimaConfirmacao <= TEMPO_MAXIMO_SENSOR_LIVRE_MS;

            const confirmacaoPosteriorAoEncerramento =
                ultimaConfirmacao !== undefined &&
                ultimaConfirmacao > ultimoEncerramento;

            if (
                !sensoresComDedoRemovido.has(dispositivo) ||
                !confirmacaoRecente ||
                !confirmacaoPosteriorAoEncerramento
            ) {
                return res.status(409).json({
                    erro: 'Aguarde uma nova confirmação de dedo removido do ESP32 antes de iniciar o monitoramento.'
                });
            }

            const sessaoId = randomUUID();

            pacientesEmMonitoramento.set(dispositivo, paciente.id);
            sessoesEmMonitoramento.set(dispositivo, sessaoId);
            confirmacoesAlarmesServidor.delete(dispositivo);

            delete estadosUI[dispositivo];

            res.json({
                status: 'monitoramento_iniciado',
                paciente,
                sessaoId
            });

        }
    );
});

app.post('/api/monitoramento/encerrar', (req, res) => {
    const { dispositivo } = req.body || {};

    if (typeof dispositivo !== 'string' || !dispositivo.trim()) {
        return res.status(400).json({
            erro: 'Dispositivo inválido.'
        });
    }

    const sessaoEncerrada =
        sessoesEmMonitoramento.get(dispositivo);

    if (dispositivosEncerrandoMonitoramento.has(dispositivo)) {
        return res.status(409).json({
            erro: 'O monitoramento já está sendo encerrado.'
        });
    }

    dispositivosEncerrandoMonitoramento.add(dispositivo);

    function finalizarMonitoramento() {
        pacientesEmMonitoramento.delete(dispositivo);
        sessoesEmMonitoramento.delete(dispositivo);
        confirmacoesAlarmesServidor.delete(dispositivo);

        ultimoEncerramentoMonitoramento.set(
            dispositivo,
            Date.now()
        );

        sensoresComDedoRemovido.delete(dispositivo);
        delete estadosUI[dispositivo];

        dispositivosEncerrandoMonitoramento.delete(dispositivo);

        res.json({
            status: 'monitoramento_encerrado',
            dispositivo
        });
    }

    if (!sessaoEncerrada) {
        return finalizarMonitoramento();
    }

    encerrarAlarmesDaSessao(
        dispositivo,
        sessaoEncerrada,
        (erro) => {
            if (erro) {
                dispositivosEncerrandoMonitoramento.delete(dispositivo);

                return res.status(500).json({
                    erro: 'Não foi possível encerrar os alarmes da sessão.'
                });
            }

            finalizarMonitoramento();
        }
    );
});

app.get('/api/monitoramento/:dispositivo', (req, res) => {
    const dispositivo = req.params.dispositivo;
    const pacienteId = pacientesEmMonitoramento.get(dispositivo);

    res.json({
        dispositivo,
        pacienteId: pacienteId ?? null,
        ativo: pacienteId !== undefined
    });
});

app.get('/api/monitoramento/sessao/:dispositivo', (req, res) => {
    const dispositivo = req.params.dispositivo;

    const sessaoId = sessoesEmMonitoramento.get(dispositivo) ?? null;

    res.json({
        dispositivo,
        sessaoId,
        ativo: sessaoId !== null
    });
});

app.get('/api/pacientes', (req, res) => {
    db.all(`SELECT * FROM pacientes`, [], (err, rows) => {
        if (err) return res.status(500).json({ erro: err.message });
        res.json(rows);
    });
});


app.post('/api/pacientes', (req, res) => {
    const { nome, idade, dispositivo } = req.body;

    const nomeValido =
        typeof nome === 'string' &&
        nome.trim().length >= 2 &&
        nome.trim().length <= 100;

    const idadeNumero = Number(idade);
    const idadeValida =
        Number.isInteger(idadeNumero) &&
        idadeNumero >= 0 &&
        idadeNumero <= 120;

    const dispositivoValido =
        typeof dispositivo === 'string' &&
        dispositivo.trim().length > 0 &&
        dispositivo.trim().length <= 100;

    if (!nomeValido || !idadeValida || !dispositivoValido) {
        return res.status(400).json({
            erro: 'Informe nome, idade e dispositivo válidos.'
        });
    }

    const sql = `
        INSERT INTO pacientes (nome, idade, dispositivo)
        VALUES (?, ?, ?)
    `;

    db.run(
        sql,
        [nome.trim(), idadeNumero, dispositivo.trim()],
        function (err) {
            if (err) {
                return res.status(500).json({
                    erro: 'Não foi possível salvar o cadastro.'
                });
            }

            res.status(201).json({
                id: this.lastID,
                nome: nome.trim(),
                idade: idadeNumero,
                dispositivo: dispositivo.trim()
            });
        }
    );
});

function encerrarAlarmesNormalizados(dispositivo, sessaoId) {
    enfileirarOperacaoAlarme({
        tipo: 'alterar_status',
        dispositivo,
        sessaoId,
        status: 'encerrado'
    });
}

function interromperAlarmesDaSessao(dispositivo, sessaoId) {
    enfileirarOperacaoAlarme({
        tipo: 'alterar_status',
        dispositivo,
        sessaoId,
        status: 'interrompido'
    });
}

function encerrarAlarmesDaSessao(dispositivo, sessaoId, callback) {
    const chave = chaveSessaoAlarme(dispositivo, sessaoId);

    sessoesComAlarmesEncerrados.add(chave);

    enfileirarOperacaoAlarme({
        tipo: 'alterar_status',
        dispositivo,
        sessaoId,
        status: 'encerrado',
        callback: (erro) => {
            if (erro) {
                sessoesComAlarmesEncerrados.delete(chave);
            }

            if (callback) callback(erro || null);
        }
    });
}

const filaSubstituicaoAlarmes = [];
let substituicaoAlarmeEmAndamento = false;

const sessoesComAlarmesEncerrados = new Set();

function chaveSessaoAlarme(dispositivo, sessaoId) {
    return JSON.stringify([dispositivo, sessaoId]);
}

function enfileirarOperacaoAlarme(operacao) {
    filaSubstituicaoAlarmes.push(operacao);
    processarFilaSubstituicaoAlarmes();
}

function substituirAlarmeAtivo(dados) {
    const chave = chaveSessaoAlarme(
        dados.dispositivo,
        dados.sessaoId
    );

    if (sessoesComAlarmesEncerrados.has(chave)) {
        console.warn(
            '[ALARME] Registro ignorado: sessão encerrada.'
        );
        return;
    }

    enfileirarOperacaoAlarme(dados);
}

function liberarFilaSubstituicaoAlarmes() {
    substituicaoAlarmeEmAndamento = false;
    processarFilaSubstituicaoAlarmes();
}

function processarFilaSubstituicaoAlarmes() {
    if (substituicaoAlarmeEmAndamento) return;

    const operacao = filaSubstituicaoAlarmes.shift();
    if (!operacao) return;

    substituicaoAlarmeEmAndamento = true;

    // Operações de encerramento, interrupção e normalização
    if (operacao.tipo === 'alterar_status') {
        const status = operacao.status;

        if (!['encerrado', 'interrompido'].includes(status)) {
            console.error('[ALARME] Status inválido:', status);
            if (operacao.callback) {
                operacao.callback(new Error('Status inválido'));
            }
            liberarFilaSubstituicaoAlarmes();
            return;
        }

        dbAlarmes.run(
            `UPDATE alarmes
             SET status = ?,
                 encerramento = CURRENT_TIMESTAMP
             WHERE dispositivo = ?
               AND sessao_id = ?
               AND status = 'ativo'`,
            [status, operacao.dispositivo, operacao.sessaoId],
            function (erro) {
                if (erro) {
                    console.error(
                        '[ALARME] Erro ao alterar status:',
                        erro.message
                    );
                }

                liberarFilaSubstituicaoAlarmes();

                if (operacao.callback) {
                    operacao.callback(erro || null);
                }
            }
        );

        return;
    }

    const dados = operacao.dados ?? operacao;

    const chave = chaveSessaoAlarme(
        dados.dispositivo,
        dados.sessaoId
    );


    const sessaoAtual = sessoesEmMonitoramento.get(
        dados.dispositivo
    );

    const pacienteAtual = pacientesEmMonitoramento.get(
        dados.dispositivo
    );

    const sessaoInvalida =
        sessaoAtual !== dados.sessaoId ||
        pacienteAtual !== dados.pacienteId;

    if (
        sessoesComAlarmesEncerrados.has(chave) ||
        dispositivosEncerrandoMonitoramento.has(dados.dispositivo) ||
        sessaoInvalida
    ) {
        console.warn(
            '[ALARME] Registro descartado: sessão ou paciente inválido.'
        );

        liberarFilaSubstituicaoAlarmes();
        return;
    }

    const motivos = [];

    if (dados.bpm < 50) motivos.push('BPM muito baixo');
    if (dados.bpm > 120) motivos.push('BPM muito elevado');
    if (dados.spo2 < 93) motivos.push('SpO2 muito baixa');

    if (dados.nivel === 'atencao') {
        if (dados.bpm < 60 && dados.bpm >= 50) {
            motivos.push('BPM abaixo do limite de atencao');
        }
        if (dados.bpm > 100 && dados.bpm <= 120) {
            motivos.push('BPM acima do limite de atencao');
        }
        if (dados.spo2 < 96 && dados.spo2 >= 93) {
            motivos.push('SpO2 abaixo do limite de atencao');
        }
    }

    const motivo = motivos.join('; ') || 'Medicao fora dos limites';

    dbAlarmes.serialize(() => {
        dbAlarmes.run('BEGIN IMMEDIATE TRANSACTION', (erroInicio) => {
            if (erroInicio) {
                console.error(
                    '[ALARME] Erro ao iniciar transação:',
                    erroInicio.message
                );
                liberarFilaSubstituicaoAlarmes();
                return;
            }

            const atualizar = `
                UPDATE alarmes
                SET status = 'encerrado',
                    encerramento = CURRENT_TIMESTAMP
                WHERE dispositivo = ?
                  AND sessao_id = ?
                  AND status = 'ativo'
            `;

            dbAlarmes.run(
                atualizar,
                [dados.dispositivo, dados.sessaoId],
                (erroAtualizacao) => {
                    if (erroAtualizacao) {
                        return dbAlarmes.run('ROLLBACK', (erroRollback) => {
                            console.error(
                                '[ALARME] Transação cancelada:',
                                erroAtualizacao.message
                            );

                            if (erroRollback) {
                                console.error('[ALARME] Falha no ROLLBACK:', erroRollback.message);
                            }

                            liberarFilaSubstituicaoAlarmes();
                        });
                    }

                    const inserir = `
                        INSERT INTO alarmes (
                            paciente_id, dispositivo, sessao_id,
                            nivel, motivo, bpm, spo2,
                            leitura_id, status
                        )
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'ativo')
                    `;

                    dbAlarmes.run(
                        inserir,
                        [
                            dados.pacienteId,
                            dados.dispositivo,
                            dados.sessaoId,
                            dados.nivel,
                            motivo,
                            dados.bpm,
                            dados.spo2,
                            dados.leituraId
                        ],
                        function (erroInsercao) {
                            if (erroInsercao) {
                                return dbAlarmes.run('ROLLBACK', (erroRollback) => {
                                    console.error(
                                        '[ALARME] Gravação cancelada:',
                                        erroInsercao.message
                                    );

                                    if (erroRollback) {
                                        console.error('[ALARME] Falha no ROLLBACK:', erroRollback.message);
                                    }

                                    liberarFilaSubstituicaoAlarmes();
                                });
                            }


                            dbAlarmes.run('COMMIT', (erroCommit) => {
                                if (erroCommit) {
                                    console.error(
                                        '[ALARME] Erro ao confirmar transação:',
                                        erroCommit.message
                                    );

                                    return dbAlarmes.run('ROLLBACK', (erroRollback) => {
                                        if (erroRollback) {
                                            console.error(
                                                '[ALARME] Falha no ROLLBACK:',
                                                erroRollback.message
                                            );
                                        }

                                        liberarFilaSubstituicaoAlarmes();
                                    });
                                }

                                console.log(
                                    `[ALARME] Nova ocorrência confirmada | ` +
                                    `Paciente: ${dados.pacienteId} | ` +
                                    `Nível: ${dados.nivel}`
                                );

                                liberarFilaSubstituicaoAlarmes();
                            });
                        }
                    );
                }
            );
        });
    });
}

function registrarAlarmeConfirmado({
    pacienteId,
    dispositivo,
    sessaoId,
    nivel,
    bpm,
    spo2,
    leituraId
}) {
    const motivos = [];

    if (bpm < 50) motivos.push('BPM muito baixo');
    if (bpm > 120) motivos.push('BPM muito elevado');
    if (spo2 < 93) motivos.push('SpO2 muito baixa');

    if (nivel === 'atencao') {
        if (bpm < 60 && bpm >= 50) {
            motivos.push('BPM abaixo do limite de atencao');
        }
        if (bpm > 100 && bpm <= 120) {
            motivos.push('BPM acima do limite de atencao');
        }
        if (spo2 < 96 && spo2 >= 93) {
            motivos.push('SpO2 abaixo do limite de atencao');
        }
    }

    const motivo = motivos.join('; ') || 'Medicao fora dos limites';

    const query = `
        INSERT INTO alarmes (
            paciente_id,
            dispositivo,
            sessao_id,
            nivel,
            motivo,
            bpm,
            spo2,
            leitura_id,
            status
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'ativo')
    `;

    db.run(
        query,
        [
            pacienteId,
            dispositivo,
            sessaoId,
            nivel,
            motivo,
            bpm,
            spo2,
            leituraId
        ],

        function (err) {
            if (err) {
                console.error(
                    '[ALARME] Erro ao registrar:',
                    err.message
                );
                return;
            }

            console.log(
                `[ALARME] Registro criado: ${this.lastID} | ` +
                `Paciente: ${pacienteId} | Nivel: ${nivel}`
            );
        }
    );
}

const confirmacoesAlarmesServidor = new Map();
const dispositivosEncerrandoMonitoramento = new Set();

function classificarAlarmeServidor(bpm, spo2) {
    if (bpm < 50 || bpm > 120 || spo2 < 93) {
        return 'critico';
    }

    if (bpm < 60 || bpm > 100 || spo2 < 96) {
        return 'atencao';
    }

    return 'normal';
}

function confirmarAlarmeServidor(
    dispositivo,
    pacienteId,
    sessaoId,
    leituraId,
    bpm,
    spo2
) {
    const nivel = classificarAlarmeServidor(bpm, spo2);

    let controle = confirmacoesAlarmesServidor.get(dispositivo);

    // Uma nova sessão nunca herda confirmações anteriores.
    if (!controle ||
        controle.pacienteId !== pacienteId ||
        controle.sessaoId !== sessaoId) {

        controle = {
            pacienteId,
            sessaoId,
            ultimoLeituraId: null,
            nivelPendente: null,
            consecutivas: 0,
            nivelConfirmado: null,
            normaisConsecutivas: 0
        };

        confirmacoesAlarmesServidor.set(dispositivo, controle);
    }

    if (leituraId <= (controle.ultimoLeituraId ?? 0)) {
        return null;
    }

    controle.ultimoLeituraId = leituraId;

    if (nivel === 'normal') {
        controle.normaisConsecutivas++;

        if (controle.normaisConsecutivas < 3) {
            return null;
        }

        const haviaAlerta = controle.nivelConfirmado !== null;

        controle.nivelPendente = null;
        controle.consecutivas = 0;
        controle.nivelConfirmado = null;

        if (haviaAlerta) {
            return 'normalizado';
        }

        return null;
    }

    controle.normaisConsecutivas = 0;

    if (controle.nivelPendente === nivel) {
        controle.consecutivas++;
    } else {
        controle.nivelPendente = nivel;
        controle.consecutivas = 1;
        controle.nivelConfirmado = null;
    }

    if (controle.consecutivas >= 3) {

        if (controle.nivelConfirmado !== nivel) {
            controle.nivelConfirmado = nivel;
            return nivel;
        }
    }

    return null;
}

app.post('/api/dados', (req, res) => {
    const { dispositivo, bpm, spo2, sessaoId } = req.body;
    estatisticasComunicacao.medicoesRecebidas++;

    const dispositivoValido =
        typeof dispositivo === 'string' &&
        dispositivo.trim().length > 0 &&
        dispositivo.length <= 100;

    const estadoEspecial =
        (bpm === 0 && spo2 === 0) ||
        (bpm === -1 && spo2 === -1);

    const leituraValida =
        Number.isInteger(bpm) &&
        Number.isInteger(spo2) &&
        bpm >= 40 &&
        bpm <= 160 &&
        spo2 >= 75 &&
        spo2 <= 100;

    if (!dispositivoValido || (!estadoEspecial && !leituraValida)) {
        estatisticasComunicacao.medicoesRejeitadas++;
        return res.status(400).json({
            erro: 'Dispositivo, BPM ou SpO2 inválidos'
        });
    }

    const sessaoAtiva = sessoesEmMonitoramento.get(dispositivo) ?? null;

    if (dispositivosEncerrandoMonitoramento.has(dispositivo)) {
        estatisticasComunicacao.medicoesRejeitadas++;

        return res.status(409).json({
            erro: 'Monitoramento em encerramento.'
        });
    }

    const sessaoInformada =
        typeof sessaoId === 'string' ? sessaoId : '';

    const sessaoInvalida = sessaoAtiva
        ? sessaoInformada !== sessaoAtiva
        : sessaoInformada !== '';

    if (sessaoInvalida) {
        estatisticasComunicacao.medicoesRejeitadas++;

        console.warn(
            `[SESSAO REJEITADA] Dispositivo: ${dispositivo}`
        );

        return res.status(409).json({
            erro: 'Sessão de monitoramento inválida ou encerrada.'
        });
    }

    ultimaConexaoESP = Date.now();

    if (bpm === 0 && spo2 === 0) {
        sensoresComDedoRemovido.add(dispositivo);
        ultimaConfirmacaoSemDedo.set(dispositivo, Date.now());
    } else {
        sensoresComDedoRemovido.delete(dispositivo);
    }

    // Comando de interface
    if (bpm <= 0) {
        confirmacoesAlarmesServidor.delete(dispositivo);

        if (sessaoAtiva) {
            interromperAlarmesDaSessao(dispositivo, sessaoAtiva);
        }

        estatisticasComunicacao.medicoesAceitas++;
        estatisticasComunicacao.estadosInterface++;

        estadosUI[dispositivo] = { bpm, spo2 };
        console.log(`[UI] Disp: ${dispositivo} | Estado: ${bpm === 0 ? 'Sem dedo' : 'A calcular'}`);
        return res.status(201).json({ status: 'Estado da interface atualizado' });
    }

    const pacienteId = pacientesEmMonitoramento.get(dispositivo) ?? null;

    if (pacienteId === null || sessaoAtiva === null) {
        estatisticasComunicacao.medicoesRejeitadas++;

        console.warn(
            `[MONITORAMENTO] Leitura descartada: nenhum paciente ativo para ${dispositivo}`
        );

        return res.status(409).json({
            erro: 'Não existe monitoramento ativo para registrar esta medição.'
        });
    }

    const query = `
        INSERT INTO leituras (dispositivo, bpm, spo2, paciente_id)
        VALUES (?, ?, ?, ?)
    `;

    db.run(query, [dispositivo, bpm, spo2, pacienteId], function (err) {

        if (err) {
            estatisticasComunicacao.falhasBanco++;

            return res.status(500).json({
                erro: err.message
            });
        }

        estatisticasComunicacao.medicoesAceitas++;
        estatisticasComunicacao.leiturasGravadas++;

        const sessaoAindaValida =
            !dispositivosEncerrandoMonitoramento.has(dispositivo) &&
            pacientesEmMonitoramento.get(dispositivo) === pacienteId &&
            sessoesEmMonitoramento.get(dispositivo) === sessaoAtiva;

        if (!sessaoAindaValida) {
            console.warn(
                `[LEITURA PENDENTE] Dispositivo: ${dispositivo} | ` +
                `Paciente: ${pacienteId} | ` +
                `Sessao: ${sessaoAtiva} | ` +
                `Leitura: ${this.lastID}`
            );

            return res.status(409).json({
                erro: 'Leitura gravada, mas a sessão foi encerrada ou alterada.'
            });
        }

        const nivelAlarmeConfirmado = confirmarAlarmeServidor(
            dispositivo,
            pacienteId,
            sessaoAtiva,
            this.lastID,
            bpm,
            spo2
        );

        if (
            nivelAlarmeConfirmado === 'normalizado' &&
            pacientesEmMonitoramento.get(dispositivo) === pacienteId &&
            sessoesEmMonitoramento.get(dispositivo) === sessaoAtiva
        ) {
            encerrarAlarmesNormalizados(dispositivo, sessaoAtiva);
        }

        if (
            nivelAlarmeConfirmado &&
            nivelAlarmeConfirmado !== 'normalizado' &&
            pacientesEmMonitoramento.get(dispositivo) === pacienteId &&
            sessoesEmMonitoramento.get(dispositivo) === sessaoAtiva
        ) {
            console.log(
                `[ALARME CONFIRMADO] Paciente: ${pacienteId} | ` +
                `Nivel: ${nivelAlarmeConfirmado} | ` +
                `BPM: ${bpm} | SpO2: ${spo2}%`
            );

            substituirAlarmeAtivo({
                pacienteId,
                dispositivo,
                sessaoId: sessaoAtiva,
                nivel: nivelAlarmeConfirmado,
                bpm,
                spo2,
                leituraId: this.lastID
            });
        }

        estadosUI[dispositivo] = {
            id: this.lastID,
            paciente_id: pacienteId,
            bpm,
            spo2,
            recebidaEm: Date.now()
        };

        console.log(
            `[IoT Saúde] Disp: ${dispositivo} | BPM: ${bpm} | SpO2: ${spo2}%`
        );

        res.status(201).json({
            status: 'Sucesso',
            leituraId: this.lastID
        });
    });
});

app.delete('/api/pacientes/:id', (req, res) => {
    const pacienteId = Number(req.params.id);

    if (!Number.isSafeInteger(pacienteId) || pacienteId <= 0) {
        return res.status(400).json({
            erro: 'ID do paciente inválido.'
        });
    }

    db.get(
        'SELECT id FROM pacientes WHERE id = ?',
        [pacienteId],
        (erro, paciente) => {
            if (erro) {
                return res.status(500).json({
                    erro: 'Erro ao consultar paciente.'
                });
            }

            if (!paciente) {
                return res.status(404).json({
                    erro: 'Paciente não encontrado.'
                });
            }

            // Impede excluir quem está sendo monitorado.
            const monitoramentoAtivo = [
                ...pacientesEmMonitoramento.values()
            ].some(id => id === pacienteId);

            if (monitoramentoAtivo) {
                return res.status(409).json({
                    erro: 'Encerre o monitoramento antes de excluir este paciente.'
                });
            }

            db.get(
                'SELECT COUNT(*) AS total FROM leituras WHERE paciente_id = ?',
                [pacienteId],
                (erroHistorico, resultado) => {
                    if (erroHistorico) {
                        return res.status(500).json({
                            erro: 'Erro ao consultar histórico.'
                        });
                    }

                    if (resultado.total > 0) {
                        return res.status(409).json({
                            erro: `Este paciente possui ${resultado.total} medições. A exclusão foi bloqueada para preservar o histórico.`
                        });
                    }

                    db.run(
                        'DELETE FROM pacientes WHERE id = ?',
                        [pacienteId],
                        function (erroExclusao) {
                            if (erroExclusao) {
                                return res.status(500).json({
                                    erro: 'Erro ao excluir paciente.'
                                });
                            }

                            res.json({
                                mensagem: 'Paciente removido com sucesso.',
                                linhasAfetadas: this.changes
                            });
                        }
                    );
                }
            );
        }
    );
});

const TEMPO_MAXIMO_LEITURA_MS = 10000;

app.get('/api/dados/ultimo/:dispositivo', (req, res) => {
    const { dispositivo } = req.params;
    const pacienteIdAtivo = pacientesEmMonitoramento.get(dispositivo);

    if (pacienteIdAtivo === undefined) {
        return res.json({
            bpm: 0,
            spo2: 0,
            paciente_id: null,
            monitoramentoAtivo: false
        });
    }

    const estado = estadosUI[dispositivo];

    if (
        estado &&
        estado.bpm > 0 &&
        estado.paciente_id !== pacienteIdAtivo
    ) {
        return res.json({
            bpm: 0,
            spo2: 0,
            paciente_id: pacienteIdAtivo,
            monitoramentoAtivo: true
        });
    }

    // Nenhum estado atual recebido desde a inicialização.
    // Não reutiliza uma leitura antiga do banco SQLite.
    if (!estado) {
        return res.json({
            bpm: 0,
            spo2: 0
        });
    }

    // Os estados sem dedo (0) e calculando (-1)
    // continuam sendo enviados normalmente ao dashboard.
    if (estado.bpm <= 0) {
        return res.json(estado);
    }

    // Verifica a idade da última medição válida.
    const idadeLeitura = Date.now() - estado.recebidaEm;

    if (
        !Number.isFinite(idadeLeitura) ||
        idadeLeitura > TEMPO_MAXIMO_LEITURA_MS
    ) {
        return res.json({
            bpm: 0,
            spo2: 0
        });
    }

    res.json(estado);
});


app.get('/api/alarmes/historico', (req, res) => {
    const query = `
        SELECT
            a.id,
            a.paciente_id,
            p.nome AS paciente_nome,
            a.dispositivo,
            a.nivel,
            a.motivo,
            a.bpm,
            a.spo2,
            a.status,
            a.inicio,
            a.encerramento
        FROM alarmes AS a
        LEFT JOIN pacientes AS p
            ON p.id = a.paciente_id
        ORDER BY a.id DESC
        LIMIT 100
    `;

    db.all(query, [], (err, registros) => {
        if (err) {
            console.error(
                '[ALARME] Erro ao consultar histórico:',
                err.message
            );

            return res.status(500).json({
                erro: 'Não foi possível consultar o histórico.'
            });
        }

        res.json(registros);
    });
});

app.get('/api/relatorios/geral', (req, res) => {
    const { inicio, fim } = req.query;

    const dataValida = valor => {
        if (typeof valor !== 'string' ||
            !/^\d{4}-\d{2}-\d{2}$/.test(valor)) {
            return false;
        }

        const data = new Date(`${valor}T00:00:00Z`);

        return !Number.isNaN(data.getTime()) &&
            data.toISOString().slice(0, 10) === valor;
    };

    if (
        (inicio !== undefined && !dataValida(inicio)) ||
        (fim !== undefined && !dataValida(fim))
    ) {
        return res.status(400).json({
            erro: 'Informe datas válidas no formato AAAA-MM-DD.'
        });
    }

    if (inicio && fim && inicio > fim) {
        return res.status(400).json({
            erro: 'A data inicial não pode ser posterior à final.'
        });
    }

    const condicoes = [];
    const parametros = [];

    if (inicio) {
        condicoes.push("date(timestamp, '-3 hours') >= ?");
        parametros.push(inicio);
    }

    if (fim) {
        condicoes.push("date(timestamp, '-3 hours') <= ?");
        parametros.push(fim);
    }

    const whereSQL = condicoes.length
        ? `WHERE ${condicoes.join(' AND ')}`
        : '';

    const query = `
        SELECT *
        FROM leituras
        ${whereSQL}
        ORDER BY id DESC
        LIMIT 100
    `;

    db.all(query, parametros, (erro, leituras) => {
        if (erro) {
            return res.status(500).json({
                erro: 'Erro ao consultar relatório geral.'
            });
        }

        res.json(leituras);
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

app.get('/api/pacientes/:id/historico', (req, res) => {
    const pacienteId = Number(req.params.id);

    const inicio = req.query.inicio;
    const fim = req.query.fim;

    function dataValida(valor) {
        if (typeof valor !== 'string' ||
            !/^\d{4}-\d{2}-\d{2}$/.test(valor)) {
            return false;
        }

        const data = new Date(valor + 'T00:00:00Z');

        return !Number.isNaN(data.getTime()) &&
            data.toISOString().slice(0, 10) === valor;
    }

    if (
        (inicio !== undefined && !dataValida(inicio)) ||
        (fim !== undefined && !dataValida(fim))
    ) {
        return res.status(400).json({
            erro: 'Informe datas válidas no formato AAAA-MM-DD.'
        });
    }

    if (inicio && fim && inicio > fim) {
        return res.status(400).json({
            erro: 'A data inicial não pode ser posterior à final.'
        });
    }

    const condicoes = ['paciente_id = ?'];
    const parametros = [pacienteId];

    if (inicio) {
        condicoes.push("date(timestamp, '-3 hours') >= ?");
        parametros.push(inicio);
    }

    if (fim) {
        condicoes.push("date(timestamp, '-3 hours') <= ?");
        parametros.push(fim);
    }

    const filtroSQL = condicoes.join(' AND ');

    if (!Number.isSafeInteger(pacienteId) || pacienteId <= 0) {
        return res.status(400).json({
            erro: 'ID do paciente inválido.'
        });
    }

    db.get(
        'SELECT id, nome, idade, dispositivo FROM pacientes WHERE id = ?',
        [pacienteId],
        (erroPaciente, paciente) => {
            if (erroPaciente) {
                return res.status(500).json({
                    erro: 'Erro ao consultar paciente.'
                });
            }

            if (!paciente) {
                return res.status(404).json({
                    erro: 'Paciente não encontrado.'
                });
            }

            const query = `
                SELECT
                    COUNT(*) AS total,
                    ROUND(AVG(bpm), 2) AS mediaBpm,
                    ROUND(AVG(spo2), 2) AS mediaSpo2,
                    MIN(timestamp) AS primeiraMedicao,
                    MAX(timestamp) AS ultimaMedicao
                FROM leituras
                WHERE ${filtroSQL}
            `;

            db.get(query, parametros, (erroResumo, resumo) => {
                if (erroResumo) {
                    return res.status(500).json({
                        erro: 'Erro ao calcular estatísticas.'
                    });
                }


                const queryHistorico = `
    SELECT id, dispositivo, bpm, spo2, timestamp
    FROM leituras
    WHERE ${filtroSQL}
    ORDER BY id DESC
    LIMIT 100
`;

                db.all(
                    queryHistorico,
                    parametros,
                    (erroLeituras, leituras) => {
                        if (erroLeituras) {
                            return res.status(500).json({
                                erro: 'Erro ao consultar histórico.'
                            });
                        }

                        res.json({
                            paciente,
                            resumo,
                            leituras
                        });
                    }
                );
            });
        }
    );
});

app.get('/api/algoritmos/medicoes', (req, res) => {
    const dispositivo = String(req.query.dispositivo || 'ESP32-BANCADA-01');
    const quantidade = Number(req.query.quantidade || 100);

    // Limita a quantidade de dados processados.
    if (
        !Number.isInteger(quantidade) ||
        quantidade < 1 ||
        quantidade > 1000
    ) {
        return res.status(400).json({
            erro: 'Quantidade deve estar entre 1 e 1000'
        });
    }

    const query = `
        SELECT id, dispositivo, bpm, spo2, timestamp
        FROM leituras
        WHERE dispositivo = ?
        ORDER BY id DESC
        LIMIT ?
    `;

    db.all(query, [dispositivo, quantidade], (err, rows) => {
        if (err) {
            return res.status(500).json({
                erro: 'Erro ao consultar medições'
            });
        }

        res.json({
            dispositivo,
            quantidadeSolicitada: quantidade,
            quantidadeEncontrada: rows.length,
            origem: 'SQLite - medições reais registradas pelo ESP32',
            medicoes: rows
        });
    });
});


/*
 * Ordenação de uma mesma amostra de registros no SQLite.
 * Não altera os dados armazenados.
 */
app.get('/api/algoritmos/ordenacao-sqlite', (req, res) => {
    const dispositivo = String(
        req.query.dispositivo || 'ESP32-BANCADA-01'
    );

    const quantidade = Number(req.query.quantidade || 50);

    if (!Number.isInteger(quantidade) ||
        quantidade < 1 || quantidade > 1000) {
        return res.status(400).json({
            erro: 'Quantidade inválida'
        });
    }

    const inicio = process.hrtime.bigint();

    const query = `
        SELECT id, dispositivo, bpm, spo2, timestamp
        FROM (
            SELECT id, dispositivo, bpm, spo2, timestamp
            FROM leituras
            WHERE dispositivo = ?
            ORDER BY id DESC
            LIMIT ?
        )
        ORDER BY bpm ASC, id DESC
    `;

    db.all(query, [dispositivo, quantidade], (err, rows) => {
        if (err) {
            return res.status(500).json({
                erro: 'Falha ao ordenar medições'
            });
        }

        const tempoMs = Number(
            process.hrtime.bigint() - inicio
        ) / 1e6;

        res.json({
            dispositivo,
            quantidadeEncontrada: rows.length,
            ordenacao: 'SQLite ORDER BY bpm ASC, id DESC',
            tempoConsultaMs: tempoMs,
            medicoes: rows
        });
    });
});


app.post('/api/algoritmos/comparar-sqlite', (req, res) => {
    const { dispositivo, ids } = req.body;

    if (
        typeof dispositivo !== 'string' ||
        !Array.isArray(ids) ||
        ids.length < 1 ||
        ids.length > 1000 ||
        !ids.every(id => Number.isSafeInteger(id) && id > 0) ||
        new Set(ids).size !== ids.length
    ) {
        return res.status(400).json({
            erro: 'Amostra de registros inválida'
        });
    }

    const marcadores = ids.map(() => '?').join(',');

    const query = `
        SELECT id, dispositivo, bpm, spo2, timestamp
        FROM leituras
        WHERE dispositivo = ?
          AND id IN (${marcadores})
        ORDER BY bpm ASC, id DESC
    `;

    const inicio = process.hrtime.bigint();

    db.all(query, [dispositivo, ...ids], (erro, registros) => {
        if (erro) {
            return res.status(500).json({
                erro: 'Erro na consulta ao SQLite'
            });
        }

        const tempoConsultaMs =
            Number(process.hrtime.bigint() - inicio) / 1e6;

        if (registros.length !== ids.length) {
            return res.status(409).json({
                erro: 'A amostra mudou durante a comparação'
            });
        }

        res.json({
            metodo: 'SQLite ORDER BY bpm ASC, id DESC',
            quantidade: registros.length,
            tempoConsultaMs,
            medicoes: registros
        });
    });
});

app.get('/modulos/ordenacao_registros.js', (req, res) => {
    res.sendFile(
        path.join(__dirname, 'algoritmos', 'ordenacao_registros.js')
    );
});


db.run(
    `UPDATE alarmes
     SET status = 'interrompido',
         encerramento = CURRENT_TIMESTAMP
     WHERE status = 'ativo'`,
    function (erro) {
        if (erro) {
            console.error(
                '[ALARME] Falha na recuperação inicial:',
                erro.message
            );

            process.exitCode = 1;
            db.close();
            dbAlarmes.close();
            return;
        }

        console.log(
            `[ALARME] Recuperação inicial concluída. ` +
            `Ocorrências interrompidas: ${this.changes}`
        );

        app.listen(PORT, () => {
            console.log(
                `Servidor rodando na porta ${PORT}! ` +
                `Acesse http://localhost:${PORT}`
            );
        });
    }
);

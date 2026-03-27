# Copilot Instructions — 11431_br-cotador-metlife-services
# MetLife Brasil · BR Life · Time Cotador Individual
#
# Este arquivo é lido automaticamente pelo GitHub Copilot no VS Code.
# Ele melhora as sugestões inline e o comportamento do Copilot Chat
# para todo o time que trabalha neste repositório.

## Identidade do projeto

Você está assistindo o time Cotador Individual da MetLife Brasil.
Este é um sistema de cotação de seguros de vida individual regulado pela SUSEP/BACEN.
Código incorreto neste sistema pode ter impacto financeiro e regulatório direto.
Seja conservador, preciso e explícito — prefira código verboso e seguro a código elegante e arriscado.

## Stack e versões

- Linguagem: C# / .NET 8+
- Framework web: ASP.NET Core (Minimal APIs ou Controllers)
- ORM: Entity Framework Core 8+
- Testes: xUnit + Moq + FluentAssertions
- Cloud: Azure (AKS, APIM, Key Vault, Service Bus)
- CI/CD: Azure DevOps Pipelines

## Arquitetura obrigatória

Siga Clean Architecture com estas camadas:

```
Domain/          → Entidades, Value Objects, interfaces de repositório, regras de negócio
Application/     → Use Cases (CQRS com MediatR quando aplicável), DTOs, validações
Infrastructure/  → EF Core, repositórios concretos, clientes HTTP, integrações
API/             → Controllers ou Minimal API endpoints, middlewares, DI setup
Tests/           → Projeto separado por camada: Domain.Tests, Application.Tests, etc.
```

**Nunca** referencie Infrastructure a partir de Domain ou Application.
**Nunca** coloque lógica de negócio em Controllers ou em Infrastructure.

## Padrões de código obrigatórios

### Nomenclatura
- Classes e métodos: PascalCase (`CalcularPremioSeguro`, `ApoliceRepository`)
- Variáveis e parâmetros: camelCase (`valorPremio`, `cpfSegurado`)
- Constantes: PascalCase com prefixo descritivo (`TaxaJurosMinima`, `PrazoMaximoDias`)
- Interfaces: prefixo `I` (`ICalculadoraPremio`, `IApoliceRepository`)
- Nomes de domínio de negócio em **português** (segurado, apolice, premio, cobertura, sinistro)

### Async/Await — CRÍTICO
```csharp
// ✅ CORRETO — sempre async até a raiz
public async Task<ResultadoCotacao> CotarAsync(SolicitacaoCotacao solicitacao, CancellationToken ct)
{
    var resultado = await _calculadora.CalcularAsync(solicitacao, ct);
    return resultado;
}

// ❌ PROIBIDO — nunca usar .Result ou .Wait()
var resultado = _calculadora.CalcularAsync(solicitacao).Result;   // deadlock em ASP.NET
_calculadora.CalcularAsync(solicitacao).Wait();                   // idem
```

### HttpClient — OBRIGATÓRIO usar IHttpClientFactory
```csharp
// ✅ CORRETO — via DI
public class IntegracaoSusepClient(IHttpClientFactory factory)
{
    private readonly HttpClient _client = factory.CreateClient("susep");
}

// ❌ PROIBIDO — instanciar diretamente (esgota sockets em produção)
var client = new HttpClient();
```

### Magic numbers — PROIBIDO
```csharp
// ✅ CORRETO
private const int IdadeMaximaEntrada = 65;
private const decimal TaxaCarregamentoMaxima = 0.30m;

// ❌ PROIBIDO
if (idade > 65) { ... }
if (taxa > 0.30m) { ... }
```

### Tratamento de exceções — PROIBIDO catch vazio
```csharp
// ✅ CORRETO — log + relançamento ou retorno de Result
catch (Exception ex)
{
    _logger.LogError(ex, "Erro ao calcular prêmio para proposta {PropostaId}", propostaId);
    throw;
}

// ❌ PROIBIDO — engole a exceção silenciosamente
catch (Exception) { }
catch { }
```

### Console.WriteLine — PROIBIDO em produção
```csharp
// ✅ CORRETO
_logger.LogInformation("Cotação {CotacaoId} processada em {ElapsedMs}ms", cotacaoId, sw.ElapsedMilliseconds);

// ❌ PROIBIDO
Console.WriteLine($"Cotação {cotacaoId} processada");
```

## Segurança e LGPD — CRÍTICO

### Dados NUNCA podem aparecer em logs
Os seguintes dados são sensíveis e **jamais** devem ser logados, incluídos em mensagens
de exceção, retornados em erros de API, ou escritos em qualquer saída persistente:

- CPF (mesmo parcialmente: "***.***.***-**" não é suficiente — não logue)
- Nome completo do segurado
- Valor de apólice ou prêmio individual
- Dados bancários (agência, conta, número de cartão)
- Data de nascimento combinada com nome
- Endereço completo

```csharp
// ✅ CORRETO — use apenas identificadores internos em logs
_logger.LogInformation("Proposta {PropostaId} aprovada", proposta.Id);

// ❌ PROIBIDO
_logger.LogInformation("CPF {Cpf} aprovado com prêmio {Premio}", segurado.Cpf, proposta.Valor);
```

### OWASP Top 10
- Nunca concatene strings para montar queries SQL — use sempre parâmetros EF Core
- Nunca exponha stacktrace em respostas de API (use middleware de exceção global)
- Nunca retorne dados sensíveis em mensagens de erro para o cliente
- Valide e sanitize todos os inputs externos (API, filas, arquivos)
- Use sempre HTTPS; nunca desabilite validação de certificado em produção

## Compliance SUSEP/BACEN — INEGOCIÁVEL

- Validações regulatórias (limites de idade, carência, cobertura mínima) **não podem ser
  removidas, comentadas ou bypassadas** — mesmo em ambientes de teste de integração
- Qualquer cálculo de prêmio ou benefício deve ser auditável e rastreável
- Campos obrigatórios por regulação não podem ter defaults silenciosos

```csharp
// ❌ PROIBIDO — comentar validação regulatória
// if (idade < IdadeMinimaSusep || idade > IdadeMaximaSusep)
//     throw new ValidacaoRegulatoria(...);

// ✅ CORRETO — nunca remover, apenas corrigir a implementação se necessário
if (idade < IdadeMinimaSusep || idade > IdadeMaximaSusep)
    throw new ValidacaoRegulatoriaSusepException($"Idade fora do intervalo regulatório permitido.");
```

## Testes unitários — OBRIGATÓRIOS

- Toda lógica de negócio nova na camada Domain e Application **deve** ter testes xUnit
- Use Moq para mockar dependências externas (repositórios, clientes HTTP)
- Cobertura mínima esperada em serviços e use cases: **80%**
- Nomeie testes seguindo: `Metodo_Cenario_ResultadoEsperado`

```csharp
[Fact]
public async Task CalcularPremio_QuandoIdadeAcimaMaximo_DeveLancarValidacaoRegulatoriaException()
{
    // Arrange
    var solicitacao = SolicitacaoBuilder.ComIdade(66);
    var calculadora = new CalculadoraPremioService(_repositorioMock.Object);

    // Act & Assert
    await Assert.ThrowsAsync<ValidacaoRegulatoriaSusepException>(
        () => calculadora.CalcularAsync(solicitacao));
}
```

## Performance e banco de dados

### Evitar N+1 — queries em loop são proibidas
```csharp
// ✅ CORRETO — carrega relacionamentos em uma única query
var propostas = await _context.Propostas
    .Include(p => p.Coberturas)
    .Include(p => p.Segurado)
    .Where(p => p.Status == StatusProposta.Pendente)
    .ToListAsync(ct);

// ❌ PROIBIDO — N+1: 1 query para propostas + N queries para coberturas
var propostas = await _context.Propostas.ToListAsync();
foreach (var p in propostas)
{
    var coberturas = await _context.Coberturas.Where(c => c.PropostaId == p.Id).ToListAsync();
}
```

### Projeções ao invés de SELECT *
```csharp
// ✅ CORRETO — seleciona apenas o necessário
var resumos = await _context.Propostas
    .Where(p => p.Status == StatusProposta.Ativa)
    .Select(p => new ResumoPropostaDto { Id = p.Id, Numero = p.Numero, DataEmissao = p.DataEmissao })
    .ToListAsync(ct);

// ❌ EVITAR — carrega entidade completa quando só precisa de 3 campos
var propostas = await _context.Propostas.Where(...).ToListAsync();
```

## Padrão de resposta de API

Use `Result<T>` ou `IActionResult` padronizado — nunca retorne dados sensíveis em erros:

```csharp
// ✅ CORRETO
return BadRequest(new { Mensagem = "Dados de entrada inválidos.", Codigo = "ENTRADA_INVALIDA" });

// ❌ PROIBIDO — expõe detalhes internos
return BadRequest(new { Erro = ex.Message, Stack = ex.StackTrace });
```

(() => {
    "use strict";

    const { ready, state, escapeHtml, formatMoney, formatNumber, formatDate, shareCampaign, showNotice } = window.leaRifas;
    const PIX_WHATSAPP = "5573998216141";
    const $ = (selector) => document.querySelector(selector);
    let campaigns = [];
    let customerRows = [];
    let customerProfiles = [];
    let managerTickets = [];
    let financeTickets = [];
    let selectedSaleCustomerId = null;

    async function loadManager() {
        await ready;
        if (!state.client) return;
        if (state.profile?.role !== "admin") {
            showNotice("Entre com a conta administradora da Lea Rifas para abrir o painel.", "error");
            return;
        }
        $("#sale-panel").classList.remove("hidden");
        $("#crm-panel").classList.remove("hidden");
        const [campaignResult, ticketResult, profileResult] = await Promise.all([
            state.client.from("campaigns").select("*").order("created_at", { ascending: false }),
            state.client.from("tickets")
                .select("id,campaign_id,ticket_number,buyer_id,buyer_name,buyer_phone,status,price_each,campaigns(name),profiles(display_name,phone)")
                .neq("status", "cancelled").order("created_at", { ascending: false }),
            state.client.from("profiles").select("id,display_name,phone").eq("role", "customer").order("display_name")
        ]);
        if (campaignResult.error) throw campaignResult.error;
        if (ticketResult.error) throw ticketResult.error;
        if (profileResult.error) throw profileResult.error;
        campaigns = campaignResult.data || [];
        customerProfiles = profileResult.data || [];
        const campaignById = new Map(campaigns.map((campaign) => [campaign.id, campaign]));
        financeTickets = ticketResult.data || [];
        const visibleTickets = (ticketResult.data || []).filter((ticket) => {
            const campaign = campaignById.get(ticket.campaign_id);
            return campaign?.status === "active" || (campaign?.status === "archived" && ["confirmed", "fiado"].includes(ticket.status));
        });
        managerTickets = visibleTickets;
        renderDashboardCampaignOptions();
        renderSaleCampaigns();
        renderSaleCustomerOptions();
        renderStats();
        renderFinanceCampaignOptions();
        renderFinance();
        renderCampaigns();
        renderCustomers(visibleTickets);
    }

    function renderDashboardCampaignOptions() {
        const select = $("#dashboard-campaign-filter");
        const selectedId = select.value;
        select.innerHTML = `<option value="">Todas as campanhas</option>${campaigns.map((campaign) =>
            `<option value="${campaign.id}">${escapeHtml(campaign.name)}</option>`
        ).join("")}`;
        if (campaigns.some((campaign) => campaign.id === selectedId)) select.value = selectedId;
    }

    function renderSaleCampaigns() {
        const select = $("#sale-campaign");
        const selectedId = select.value;
        const activeCampaigns = campaigns.filter((campaign) => campaign.status === "active");
        select.innerHTML = activeCampaigns.map((campaign) =>
            `<option value="${campaign.id}">${escapeHtml(campaign.name)}</option>`
        ).join("");
        if (activeCampaigns.some((campaign) => campaign.id === selectedId)) select.value = selectedId;
        $("#sale-submit").disabled = activeCampaigns.length === 0;
        if (!activeCampaigns.length) {
            select.innerHTML = '<option value="">Nenhuma campanha aberta</option>';
        }
    }

    function parseSaleNumbers(value) {
        const entries = value.trim().split(/[\s,;]+/).filter(Boolean);
        if (!entries.length || entries.some((entry) => !/^\d{1,2}$/.test(entry))) {
            throw new Error("Informe dezenas de 00 a 99, separadas por vírgula ou espaço.");
        }
        const numbers = entries.map(Number);
        if (numbers.some((number) => number < 0 || number > 99)) {
            throw new Error("As dezenas devem estar entre 00 e 99.");
        }
        if (new Set(numbers).size !== numbers.length) {
            throw new Error("Remova as dezenas repetidas da seleção.");
        }
        return numbers;
    }

    function normalizeContactPhone(value) {
        if (!value.trim()) return "";
        const digits = value.replace(/\D/g, "");
        if (/^55\d{10,11}$/.test(digits)) return `+${digits}`;
        if (/^\d{10,11}$/.test(digits)) return `+55${digits}`;
        throw new Error("Informe um telefone com DDD válido para contato.");
    }

    function saleCustomerOption(profile) {
        const name = profile.display_name || profile.phone || "Cliente";
        return `${name} · ${profile.phone || "sem telefone"}`;
    }

    function renderSaleCustomerOptions() {
        $("#sale-customer-options").innerHTML = customerProfiles.map((profile) =>
            `<option value="${escapeHtml(saleCustomerOption(profile))}"></option>`
        ).join("");
    }

    function selectSaleCustomer() {
        const value = $("#sale-customer-search").value;
        const previousProfile = customerProfiles.find((item) => item.id === selectedSaleCustomerId);
        const profile = customerProfiles.find((item) => saleCustomerOption(item) === value);
        selectedSaleCustomerId = profile?.id || null;
        if (!profile && previousProfile) {
            if ($("#sale-customer-name").value === previousProfile.display_name) $("#sale-customer-name").value = "";
            if ($("#sale-customer-phone").value === previousProfile.phone) $("#sale-customer-phone").value = "";
        }
        if (!profile) return;
        $("#sale-customer-name").value = profile.display_name || "";
        $("#sale-customer-phone").value = profile.phone || "";
    }

    async function createSale(event) {
        event.preventDefault();
        const button = $("#sale-submit");
        button.disabled = true;
        try {
            const campaignId = $("#sale-campaign").value;
            const buyerName = $("#sale-customer-name").value.trim();
            if (!campaignId) throw new Error("Selecione uma campanha aberta.");
            if (!buyerName) throw new Error("Informe o nome do cliente.");
            const { data, error } = await state.client.rpc("admin_create_campaign_sale", {
                p_campaign_id: campaignId,
                p_numbers: parseSaleNumbers($("#sale-numbers").value),
                p_buyer_name: buyerName,
                p_buyer_phone: normalizeContactPhone($("#sale-customer-phone").value),
                p_buyer_id: selectedSaleCustomerId,
                p_status: $("#sale-status").value
            });
            if (error) throw error;
            $("#sale-form").reset();
            selectedSaleCustomerId = null;
            showNotice(`Venda registrada para ${buyerName}: ${data} dezena${data === 1 ? "" : "s"}.`, "success");
            await loadManager();
        } finally {
            button.disabled = false;
        }
    }

    function renderStats() {
        const selectedId = $("#dashboard-campaign-filter").value;
        const selectedCampaigns = campaigns.filter((campaign) => !selectedId || campaign.id === selectedId);
        const activeCampaigns = selectedCampaigns.filter((campaign) => campaign.status === "active");
        const campaignIds = new Set(selectedCampaigns.map((campaign) => campaign.id));
        const tickets = managerTickets.filter((ticket) => campaignIds.has(ticket.campaign_id));
        const reservedActive = tickets.filter((ticket) => activeCampaigns.some((campaign) => campaign.id === ticket.campaign_id)).length;
        const pending = tickets.filter((ticket) => ticket.status === "pending").length;
        const customerIds = new Set(tickets.map((ticket) =>
            ticket.buyer_id
            || customerPhoneKey(ticket.profiles?.phone || ticket.buyer_phone)
            || (ticket.buyer_name || ticket.profiles?.display_name || "").trim().toLocaleLowerCase("pt-BR")
        ).filter(Boolean));
        const stats = [
            ["Campanhas abertas", activeCampaigns.length],
            ["Dezenas reservadas", `${reservedActive} / ${activeCampaigns.length * 100}`],
            ["Reservas pendentes", pending],
            ["Clientes atendidos", customerIds.size]
        ];
        $("#manager-stats").innerHTML = stats.map(([label, value]) => `<div class="stat"><small>${label}</small><strong>${value}</strong></div>`).join("");
    }

    function renderFinance() {
        const campaignId = $("#finance-campaign-filter").value;
        const campaign = campaigns.find((item) => item.id === campaignId);
        const history = $("#finance-customer-history");
        if (!campaign) {
            $("#finance-stats").innerHTML = "";
            history.innerHTML = '<p class="empty">Selecione uma campanha para visualizar o histórico.</p>';
            return;
        }
        const campaignTickets = financeTickets.filter((ticket) => ticket.campaign_id === campaignId);
        const confirmed = campaignTickets.filter((ticket) => ticket.status === "confirmed");
        const outstanding = campaignTickets.filter((ticket) => ticket.status === "pending" || ticket.status === "fiado");
        const query = $("#reservation-customer-search").value.trim().toLocaleLowerCase("pt-BR");
        const queryDigits = query.replace(/\D/g, "");
        const customers = [];
        const customerAliases = new Map();
        for (const ticket of campaignTickets) {
            const phone = ticket.profiles?.phone || ticket.buyer_phone || "";
            const phoneKey = customerPhoneKey(phone);
            const buyerId = ticket.buyer_id || "";
            const name = ticket.profiles?.display_name || ticket.buyer_name || "Cliente";
            const normalizedName = name.trim().toLocaleLowerCase("pt-BR");
            const aliases = [
                buyerId && `user:${buyerId}`,
                phoneKey && `phone:${phoneKey}`,
                !buyerId && !phoneKey && normalizedName && `name:${normalizedName}`
            ].filter(Boolean);
            let customer = aliases.map((alias) => customerAliases.get(alias)).find(Boolean);
            if (!customer) {
                customer = { name, phone, phoneKey, tickets: [] };
                customers.push(customer);
            } else {
                if ((!customer.name || customer.name === "Cliente") && name !== "Cliente") customer.name = name;
                if (!customer.phone && phone) {
                    customer.phone = phone;
                    customer.phoneKey = phoneKey;
                }
            }
            customer.tickets.push(ticket);
            aliases.forEach((alias) => customerAliases.set(alias, customer));
        }
        const customerRows = customers.filter((customer) => {
            if (!query) return true;
            return customer.name.toLocaleLowerCase("pt-BR").includes(query)
                || customer.phone.toLocaleLowerCase("pt-BR").includes(query)
                || (queryDigits && customer.phoneKey.includes(queryDigits));
        });
        const sum = (tickets) => tickets.reduce((amount, ticket) => amount + Number(ticket.price_each), 0);
        const stats = [
            ["Total negociado", formatMoney(sum([...confirmed, ...outstanding]))],
            ["Recebido", formatMoney(sum(confirmed))],
            ["A receber", formatMoney(sum(outstanding))],
            ["Dezenas", campaignTickets.length]
        ];
        $("#finance-stats").innerHTML = stats.map(([label, value]) => `<div class="stat"><small>${label}</small><strong>${value}</strong></div>`).join("");
        if (!customerRows.length) {
            history.innerHTML = campaignTickets.length
                ? '<p class="empty">Nenhum cliente encontrado para esta busca.</p>'
                : '<p class="empty">Ainda não há reservas nesta campanha.</p>';
            return;
        }
        const rows = customerRows.map((customer) => {
            const paid = customer.tickets.filter((ticket) => ticket.status === "confirmed");
            const due = customer.tickets.filter((ticket) => ticket.status === "pending" || ticket.status === "fiado");
            const paidAmount = sum(paid);
            const dueAmount = sum(due);
            const numbers = customer.tickets.map((ticket) => {
                const status = ticket.status === "confirmed" ? "Pago" : ticket.status === "fiado" ? "Fiado" : "Pendente";
                const actions = ticket.status === "pending"
                    ? `<button type="button" class="button small" data-action="confirm" data-id="${ticket.id}">Confirmar Pix</button><button type="button" class="button gold small" data-action="fiado" data-id="${ticket.id}">Fiado</button><button type="button" class="button red small" data-action="release" data-id="${ticket.id}">Liberar</button>`
                    : ticket.status === "fiado"
                        ? `<button type="button" class="button small" data-action="confirm" data-id="${ticket.id}">Receber Pix</button><button type="button" class="button red small" data-action="release" data-id="${ticket.id}">Liberar</button>`
                        : "";
                return `<span class="finance-ticket"><span class="badge${ticket.status === "confirmed" ? "" : " pending"}">${formatNumber(ticket.ticket_number)} · ${status}</span>${actions}</span>`;
            }).join("");
            const message = `Olá, ${customer.name}! Passando para lembrar do pagamento de ${formatMoney(dueAmount)} referente às dezenas ${due.map((ticket) => formatNumber(ticket.ticket_number)).join(", ")} da campanha ${campaign.name}.`;
            const collectionLink = due.length && customer.phoneKey
                ? `<a class="button gold small" href="https://wa.me/${customer.phoneKey}?text=${encodeURIComponent(message)}" target="_blank" rel="noopener noreferrer">Cobrar pelo WhatsApp</a>`
                : due.length ? "Sem telefone" : "—";
            return `<tr>
                <td><strong>${escapeHtml(customer.name)}</strong>${customer.phone ? `<br><small>${escapeHtml(customer.phone)}</small>` : ""}</td>
                <td><div class="finance-ticket-list">${numbers}</div></td>
                <td>${formatMoney(paidAmount)}</td>
                <td>${formatMoney(dueAmount)}</td>
                <td>${collectionLink}</td>
            </tr>`;
        }).join("");
        history.innerHTML = `<table><thead><tr><th>Cliente</th><th>Dezenas e situação</th><th>Pago</th><th>A receber</th><th>Cobrança</th></tr></thead><tbody>${rows}</tbody></table>`;
    }

    function renderFinanceCampaignOptions() {
        const select = $("#finance-campaign-filter");
        const selectedId = select.value;
        select.innerHTML = `<option value="">Selecione uma campanha</option>${campaigns.map((campaign) =>
            `<option value="${campaign.id}">${escapeHtml(campaign.name)}${campaign.status === "archived" ? " (encerrada)" : ""}</option>`
        ).join("")}`;
        if (campaigns.some((campaign) => campaign.id === selectedId)) select.value = selectedId;
    }

    function customerPhoneKey(phone) {
        let digits = String(phone || "").replace(/\D/g, "").replace(/^0/, "");
        if (/^\d{10,11}$/.test(digits)) digits = `55${digits}`;
        return digits;
    }

    function renderCustomers(tickets) {
        const customers = new Map();
        for (const ticket of tickets) {
            const phone = ticket.profiles?.phone || ticket.buyer_phone || "";
            const phoneKey = customerPhoneKey(phone);
            const key = ticket.buyer_id ? `user:${ticket.buyer_id}` : phoneKey ? `phone:${phoneKey}` : `ticket:${ticket.id}`;
            let customer = customers.get(key);
            if (!customer) {
                customer = {
                    name: ticket.profiles?.display_name || ticket.buyer_name || "Cliente",
                    phone,
                    phoneKey,
                    numberCounts: new Map(),
                    ticketCount: 0,
                    debt: 0
                };
                customers.set(key, customer);
            } else if ((!customer.name || customer.name === "Cliente") && ticket.buyer_name) {
                customer.name = ticket.buyer_name;
            }
            customer.ticketCount += 1;
            customer.numberCounts.set(ticket.ticket_number, (customer.numberCounts.get(ticket.ticket_number) || 0) + 1);
            if (ticket.status === "pending" || ticket.status === "fiado") customer.debt += Number(ticket.price_each);
        }

        customerRows = [...customers.values()].sort((first, second) =>
            second.debt - first.debt || second.ticketCount - first.ticketCount || first.name.localeCompare(second.name, "pt-BR")
        );
        filterCustomers();
    }

    function filterCustomers() {
        const query = $("#customer-search").value.trim().toLocaleLowerCase("pt-BR");
        const rows = customerRows.filter((customer) =>
            !query || customer.name.toLocaleLowerCase("pt-BR").includes(query) || customer.phone.includes(query) || customer.phoneKey.includes(query)
        );
        if (!customerRows.length) {
            $("#manager-customers").innerHTML = '<p class="empty">Os clientes aparecerão aqui conforme as vendas pelo painel ou pelo link forem registradas.</p>';
            return;
        }
        if (!rows.length) {
            $("#manager-customers").innerHTML = '<p class="empty">Nenhum cliente encontrado.</p>';
            return;
        }
        $("#manager-customers").innerHTML = `<table><thead><tr><th>Cliente</th><th>Débito pendente</th><th>Dezenas mais compradas</th><th>Dezenas no histórico</th><th>Contato</th></tr></thead><tbody>${rows.map((customer) => {
            const favorites = [...customer.numberCounts.entries()]
                .sort(([firstNumber, firstCount], [secondNumber, secondCount]) => secondCount - firstCount || firstNumber - secondNumber)
                .slice(0, 5)
                .map(([number, count]) => `${formatNumber(number)} (${count}x)`)
                .join(", ");
            const contact = customer.phone
                ? `<a class="button secondary small" href="https://wa.me/${customer.phoneKey}" target="_blank" rel="noopener noreferrer">WhatsApp</a>`
                : "—";
            return `<tr>
                <td><strong>${escapeHtml(customer.name)}</strong>${customer.phone ? `<br><small>${escapeHtml(customer.phone)}</small>` : ""}</td>
                <td><span class="badge${customer.debt ? " pending" : ""}">${formatMoney(customer.debt)}</span></td>
                <td>${favorites || "—"}</td>
                <td>${customer.ticketCount}</td>
                <td>${contact}</td>
            </tr>`;
        }).join("")}</tbody></table>`;
    }

    function renderCampaigns() {
        if (!campaigns.length) {
            $("#manager-campaigns").innerHTML = '<p class="empty">Crie a primeira campanha para começar.</p>';
            return;
        }
        $("#manager-campaigns").innerHTML = `<table><thead><tr><th>Campanha</th><th>Dezena</th><th>Status</th><th>Ações</th></tr></thead><tbody>${campaigns.map((campaign) => `
            <tr>
                <td><strong>${escapeHtml(campaign.name)}</strong><br><small>${campaign.draw_date ? formatDate(campaign.draw_date) : "Sem data"}</small></td>
                <td>${formatMoney(campaign.ticket_price)}</td>
                <td><span class="badge${campaign.status === "archived" ? " archived" : ""}">${campaign.status === "active" ? "Aberta" : "Arquivada"}</span></td>
                <td>
                    <button type="button" class="button secondary small" data-action="share" data-id="${campaign.id}">Link</button>
                    <button type="button" class="button secondary small" data-action="card" data-id="${campaign.id}">Card 9:16</button>
                    ${campaign.status === "active" ? `<button type="button" class="button secondary small" data-action="edit" data-id="${campaign.id}">Editar</button><button type="button" class="button gold small" data-action="archive" data-id="${campaign.id}">Arquivar</button>` : ""}
                </td>
            </tr>`).join("")}</tbody></table>`;
    }

    function resetCampaignForm() {
        $("#campaign-form").reset();
        $("#campaign-id").value = "";
        $("#campaign-form-title").textContent = "Criar campanha";
        $("#campaign-form-panel").classList.add("hidden");
    }

    function openCampaignForm(campaign = null) {
        $("#campaign-form").reset();
        $("#campaign-id").value = campaign?.id || "";
        $("#campaign-form-title").textContent = campaign ? "Editar campanha" : "Criar campanha";
        $("#form-name").value = campaign?.name || "";
        $("#form-prize").value = campaign ? Number(campaign.prize_amount).toLocaleString("pt-BR", { minimumFractionDigits: 2 }) : "";
        $("#form-price").value = campaign ? Number(campaign.ticket_price).toLocaleString("pt-BR", { minimumFractionDigits: 2 }) : "";
        $("#form-date").value = campaign?.draw_date || "";
        $("#campaign-form-panel").classList.remove("hidden");
        $("#form-name").focus();
    }

    function parseMoney(value) {
        const normalized = String(value).trim().replace(/\s/g, "").replace(/\.(?=\d{3}(?:\D|$))/g, "").replace(",", ".");
        const amount = Number(normalized);
        return Number.isFinite(amount) ? amount : 0;
    }

    async function saveCampaign(event) {
        event.preventDefault();
        const id = $("#campaign-id").value;
        const campaign = {
            name: $("#form-name").value.trim(),
            prize_amount: parseMoney($("#form-prize").value),
            ticket_price: parseMoney($("#form-price").value),
            draw_date: $("#form-date").value || null
        };
        if (!campaign.name || campaign.prize_amount <= 0 || campaign.ticket_price <= 0) {
            showNotice("Informe nome, prêmio e valor por dezena válidos.", "error");
            return;
        }
        const query = id
            ? state.client.from("campaigns").update(campaign).eq("id", id)
            : state.client.from("campaigns").insert({ ...campaign, created_by: state.session.user.id, status: "active" });
        const { error } = await query;
        if (error) throw error;
        resetCampaignForm();
        showNotice(id ? "Campanha atualizada." : "Campanha criada. Agora copie e compartilhe o link.", "success");
        await loadManager();
    }

    function openArchiveForm(id) {
        $("#archive-form").reset();
        $("#archive-campaign-id").value = id;
        $("#winner-name-field").classList.add("hidden");
        $("#archive-modal").classList.remove("hidden");
        $("#drawn-number").focus();
    }

    async function archiveCampaign(event) {
        event.preventDefault();
        const input = $("#drawn-number").value.trim();
        const drawnNumber = Number(input);
        if (!/^\d{1,2}$/.test(input) || drawnNumber < 0 || drawnNumber > 99) {
            showNotice("Informe a dezena sorteada entre 00 e 99.", "error");
            return;
        }
        const publish = $("#publish-winner").checked;
        const { error } = await state.client.from("campaigns")
            .update({
                status: "archived",
                drawn_number: drawnNumber,
                winner_published: publish,
                winner_name_public: publish ? ($("#winner-name").value.trim() || null) : null,
                archived_at: new Date().toISOString()
            })
            .eq("id", $("#archive-campaign-id").value);
        if (error) throw error;
        $("#archive-modal").classList.add("hidden");
        showNotice(`Campanha arquivada com a dezena ${formatNumber(drawnNumber)}.`, "success");
        await loadManager();
    }

    async function confirmTicket(id) {
        const { error } = await state.client.from("tickets").update({ status: "confirmed" }).eq("id", id).in("status", ["pending", "fiado"]);
        if (error) throw error;
        showNotice("Pagamento Pix confirmado.", "success");
        await loadManager();
    }

    async function markTicketAsFiado(id) {
        const { error } = await state.client.from("tickets").update({ status: "fiado" }).eq("id", id).eq("status", "pending");
        if (error) throw error;
        showNotice("Dezena marcada como fiado e adicionada ao débito do cliente.", "success");
        await loadManager();
    }

    async function releaseTicket(id) {
        if (!confirm("Liberar esta dezena? Ela ficará disponível para outra pessoa.")) return;
        const { error } = await state.client.from("tickets").update({ status: "cancelled" }).eq("id", id).in("status", ["pending", "fiado"]);
        if (error) throw error;
        showNotice("Reserva liberada.", "success");
        await loadManager();
    }

    async function exportCard(id, button) {
        const campaign = campaigns.find((item) => item.id === id);
        if (!campaign) return;
        button.disabled = true;
        try {
            const { data, error } = await state.client.from("campaign_number_status")
                .select("ticket_number,status").eq("campaign_id", id);
            if (error) throw error;
            const sold = new Map((data || []).map((item) => [item.ticket_number, item.status]));
            $("#poster-price").textContent = formatMoney(campaign.ticket_price);
            $("#poster-prize").textContent = formatMoney(campaign.prize_amount);
            $("#poster-numbers").innerHTML = Array.from({ length: 100 }, (_, index) => (index + 1) % 100).map((number) => {
                const status = sold.get(number);
                const classes = status === "confirmed" ? "reserved paid" : status ? "reserved" : "";
                return `<span class="poster-number ${classes}">${status ? "🍀" : formatNumber(number)}</span>`;
            }).join("");
            $("#poster-slogan span").textContent = campaign.status === "archived" && campaign.winner_published
                ? `Ganhador: ${formatNumber(campaign.drawn_number)}${campaign.winner_name_public ? ` · ${campaign.winner_name_public}` : ""}`
                : "Boa Sorte!";
            const poster = $("#poster");
            poster.style.position = "fixed";
            poster.style.left = "0";
            poster.style.top = "0";
            poster.style.zIndex = "10000";
            const canvas = await html2canvas(poster, { scale: 1, backgroundColor: "#f7f3e5", useCORS: true });
            const blob = await new Promise((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error("Não foi possível criar a imagem.")), "image/png"));
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = url;
            link.download = `Lea_Rifas_${campaign.name.trim().replace(/[^a-z0-9]+/gi, "_")}_9x16.png`;
            document.body.append(link);
            link.click();
            link.remove();
            window.setTimeout(() => URL.revokeObjectURL(url), 1000);
        } catch (error) {
            console.error("Erro ao exportar o card.", error);
            showNotice(`Não foi possível gerar o card: ${error.message}`, "error");
        } finally {
            $("#poster").style.cssText = "";
            button.disabled = false;
        }
    }

    function handleError(error) {
        console.error("Erro no painel gerencial.", error);
        showNotice(`Não foi possível concluir a ação: ${error.message}`, "error");
    }

    $("#new-campaign-button").addEventListener("click", () => openCampaignForm());
    $("#cancel-campaign-form").addEventListener("click", resetCampaignForm);
    $("#campaign-form").addEventListener("submit", (event) => saveCampaign(event).catch(handleError));
    $("#sale-form").addEventListener("submit", (event) => createSale(event).catch(handleError));
    $("#sale-customer-search").addEventListener("change", selectSaleCustomer);
    $("#customer-search").addEventListener("input", filterCustomers);
    $("#dashboard-campaign-filter").addEventListener("change", renderStats);
    $("#finance-campaign-filter").addEventListener("change", renderFinance);
    $("#reservation-customer-search").addEventListener("input", renderFinance);
    $("#archive-form").addEventListener("submit", (event) => archiveCampaign(event).catch(handleError));
    $("#publish-winner").addEventListener("change", () => {
        $("#winner-name-field").classList.toggle("hidden", !$("#publish-winner").checked);
    });
    $("#archive-modal").addEventListener("click", (event) => {
        if (event.target === $("#archive-modal") || event.target.closest('[data-action="close-modal"]')) {
            $("#archive-modal").classList.add("hidden");
        }
    });
    $("#manager-campaigns").addEventListener("click", (event) => {
        const button = event.target.closest("[data-action]");
        if (!button) return;
        const campaign = campaigns.find((item) => item.id === button.dataset.id);
        if (button.dataset.action === "share") window.leaRifas.shareCampaign(button.dataset.id);
        if (button.dataset.action === "card") exportCard(button.dataset.id, button);
        if (button.dataset.action === "edit" && campaign) openCampaignForm(campaign);
        if (button.dataset.action === "archive") openArchiveForm(button.dataset.id);
    });
    $("#finance-customer-history").addEventListener("click", (event) => {
        const button = event.target.closest("[data-action]");
        if (!button) return;
        if (button.dataset.action === "confirm") confirmTicket(button.dataset.id).catch(handleError);
        if (button.dataset.action === "fiado") markTicketAsFiado(button.dataset.id).catch(handleError);
        if (button.dataset.action === "release") releaseTicket(button.dataset.id).catch(handleError);
    });
    window.addEventListener("keydown", (event) => {
        if (event.key === "Escape") $("#archive-modal").classList.add("hidden");
    });
    window.addEventListener("lea:session", () => loadManager().catch(handleError));
    loadManager().catch(handleError);
})();

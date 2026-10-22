(() => {
    "use strict";

    const { ready, state, escapeHtml, formatMoney, formatNumber, showNotice } = window.leaRifas;
    const PIX_WHATSAPP = "5573998216141";
    const container = document.querySelector("#my-reservations");

    async function loadReservations() {
        await ready;
        if (!state.client) {
            container.innerHTML = '<p class="empty">Configure o Supabase para acompanhar suas dezenas.</p>';
            return;
        }
        if (!state.session) {
            container.innerHTML = '<p class="empty">Entre na sua conta para ver suas reservas. <a href="./entrar.html">Entrar ou criar conta</a></p>';
            return;
        }
        const { data, error } = await state.client.from("tickets")
            .select("id,ticket_number,status,price_each,created_at,campaigns(name)")
            .eq("buyer_id", state.session.user.id)
            .neq("status", "cancelled")
            .order("created_at", { ascending: false });
        if (error) throw error;
        if (!data?.length) {
            container.innerHTML = '<p class="empty">Você ainda não reservou dezenas.</p>';
            return;
        }
        container.innerHTML = `<table><thead><tr><th>Campanha</th><th>Dezena</th><th>Valor</th><th>Status</th><th>Comprovante</th></tr></thead><tbody>${data.map((ticket) => {
            const campaignName = ticket.campaigns?.name || "Lea Rifas";
            const message = ticket.status === "fiado"
                ? `Olá, Lea! Quero combinar o pagamento da dezena ${formatNumber(ticket.ticket_number)} da campanha ${campaignName}.`
                : `Olá, Lea! Estou enviando o comprovante Pix da dezena ${formatNumber(ticket.ticket_number)} da campanha ${campaignName}.`;
            const whatsapp = `https://wa.me/${PIX_WHATSAPP}?text=${encodeURIComponent(message)}`;
            const status = ticket.status === "confirmed" ? "Pagamento confirmado" : ticket.status === "fiado" ? "Fiado / pagamento pendente" : "Aguardando comprovante";
            return `<tr>
                <td>${escapeHtml(campaignName)}</td><td>${formatNumber(ticket.ticket_number)}</td>
                <td>${formatMoney(ticket.price_each)}</td>
                <td><span class="badge${ticket.status !== "confirmed" ? " pending" : ""}">${status}</span></td>
                <td>${ticket.status !== "confirmed" ? `<a class="button secondary small" href="${whatsapp}" target="_blank" rel="noopener noreferrer">${ticket.status === "fiado" ? "Combinar pagamento" : "Enviar pelo WhatsApp"}</a>` : "—"}</td>
            </tr>`;
        }).join("")}</tbody></table>`;
    }

    async function initialize() {
        try {
            await loadReservations();
        } catch (error) {
            console.error("Erro ao carregar as reservas.", error);
            showNotice(`Não foi possível carregar suas reservas: ${error.message}`, "error");
        }
    }

    window.addEventListener("lea:session", initialize);
    initialize();
})();

/* Public forms use explicit publication and durable server receipts. */
(function (global) {
  'use strict';
  const route = id => `/forms/${encodeURIComponent(id)}`;
  function saveJSON(value, name) {
    const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function entry({ client, ctx, host }) {
    const field = ctx.input('Public form ID', 'text', ''); host.append(field.wrap);
    host.append(ctx.button('Open public form', 'clipboard', async () => {
      const feedback = ctx.el('p', '', 'Loading form…'); host.append(feedback);
      try {
        const schema = await client.request(route(field.input.value.trim())); feedback.remove();
        const dialog = ctx.modal(schema.name, 'Answers are sent to this form’s owner on the connected service only when you submit.');
        const form = document.createElement('form'), controls = [];
        for (const item of schema.fields) {
          const control = ctx.input(item.label, item.type, ''); control.input.required = item.required; control.input.maxLength = 10000;
          controls.push({ item, input: control.input }); form.append(control.wrap);
        }
        const status = ctx.el('p', '', ''), submit = ctx.button('Submit answers', 'send', () => form.requestSubmit()); submit.type = 'button';
        let pending = null;
        form.addEventListener('submit', async event => {
          event.preventDefault(); if (submit.disabled) return;
          const values = Object.fromEntries(controls.map(({ item, input }) => [item.id, item.type === 'checkbox' ? input.checked : input.value]));
          const serialized = JSON.stringify(values);
          if (!pending || pending.serialized !== serialized) pending = { serialized, submissionId: `response:${crypto.randomUUID()}` };
          submit.disabled = true; status.textContent = 'Submitting…';
          try {
            const receipt = await client.request(`${route(schema.id)}/submissions`, { method: 'POST', body: { submissionId: pending.submissionId, values } });
            status.textContent = `Received by the service. Receipt: ${receipt.id}`;
            controls.forEach(control => { control.input.disabled = true; }); submit.remove();
          } catch (error) { status.textContent = `${error.message} Answers remain here; retry to confirm receipt.`; submit.disabled = false; }
        });
        form.append(submit, status); dialog.append(form, ctx.button('Close form', 'x', () => dialog.close()));
      } catch (error) { feedback.textContent = error.message; }
    }));
  }
  async function manage({ client, ctx, host, projectId, snapshot, refresh }) {
    const root = ctx.el('section', 'hc-section'); host.append(root);
    root.append(ctx.el('h3', '', 'Public forms'), ctx.el('p', 'muted', 'Publish only a selected form schema. Existing responses stay private. Anyone with its ID can submit until expiry or revocation.'));
    const base = `/projects/${encodeURIComponent(projectId)}/forms`, status = ctx.el('p', '', '');
    const run = operation => async () => { try { await operation(); } catch (error) { status.textContent = error.message; } };
    for (const asset of snapshot.assets.filter(asset => asset.state === 'active')) {
      for (const version of asset.versions.filter(version => version.mime === 'application/vnd.hole.form+json')) {
        root.append(ctx.button(`Review public form ${asset.name} · ${version.id}`, 'eye', run(async () => {
          const blob = await client.request(`/assets/${encodeURIComponent(asset.id)}/versions/${encodeURIComponent(version.id)}`, { binary: true });
          const source = JSON.parse(await blob.text());
          const dialog = ctx.modal('Publish this form?', 'The public schema excludes saved responses. Publication expires after seven days. Nothing is sent to recipients automatically.');
          const fields = (source.fields || []).map(({ id, label, type, required }) => ({ id, label, type, required: required === true }));
          dialog.append(ctx.el('pre', '', JSON.stringify(fields, null, 2)));
          const feedback = ctx.el('p', '', '');
          dialog.append(ctx.button('Publish form schema', 'share', async () => {
            try { const result = await client.request(base, { method: 'POST', body: { name: asset.name, assetId: asset.id, versionId: version.id, expectedRevision: snapshot.project.revision } }); feedback.textContent = `Published. Public form ID: ${result.id}`; await refresh(); }
            catch (error) { feedback.textContent = error.message; }
          }), feedback, ctx.button('Close publication review', 'x', () => dialog.close()));
        })));
      }
    }
    const listing = await client.request(base);
    for (const form of listing.forms) {
      root.append(ctx.el('p', '', `${form.name} · ${form.id} · ${form.revokedAt ? 'revoked' : form.expiresAt <= Date.now() ? 'expired' : 'active'} · ${form.responseCount} responses`));
      root.append(ctx.button(`Review responses ${form.name}`, 'list', run(async () => {
        const result = await client.request(`${base}/${encodeURIComponent(form.id)}/responses`);
        const dialog = ctx.modal('Private form responses', 'Only the current project owner can retrieve these responses.');
        dialog.append(ctx.el('pre', '', JSON.stringify(result.responses, null, 2)), ctx.button('Export responses JSON', 'download', () => saveJSON({ formId: form.id, responses: result.responses }, 'form-responses.json')), ctx.button('Close responses', 'x', () => dialog.close()));
      })));
      if (!form.revokedAt) root.append(ctx.button(`Revoke form ${form.name}`, 'shield-off', run(async () => { await client.request(`${base}/${encodeURIComponent(form.id)}`, { method: 'DELETE' }); await refresh(); })));
    }
    root.append(status);
  }
  global.HolePublicForms = Object.freeze({ entry, manage });
})(globalThis);

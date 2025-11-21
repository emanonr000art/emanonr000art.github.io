(function () {
  const form = document.getElementById('video-job-form');
  const submitBtn = document.getElementById('video-job-submit');
  const statusChip = document.getElementById('job-status-chip');
  const statusText = document.getElementById('job-status-text');
  const jobIdField = document.getElementById('job-id');
  const videoLink = document.getElementById('job-video-link');
  const errorText = document.getElementById('job-error');

  let pollTimer = null;
  let currentJobId = null;

  const setStatus = (label, tone) => {
    statusChip.textContent = label;
    statusChip.className = `status-chip ${tone}`;
  };

  const setText = (text) => {
    statusText.textContent = text;
  };

  const setError = (message) => {
    errorText.textContent = message || '';
    errorText.style.display = message ? 'block' : 'none';
  };

  const setVideoLink = (url) => {
    if (url) {
      videoLink.innerHTML = `<a href="${url}" target="_blank" rel="noopener">查看生成视频</a>`;
      videoLink.style.display = 'block';
    } else {
      videoLink.innerHTML = '';
      videoLink.style.display = 'none';
    }
  };

  const stopPolling = () => {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  };

  const pollJob = async (jobId) => {
    try {
      const response = await fetch(`/api/videos/${jobId}`);
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error || '获取任务状态失败');
      }

      const status = payload.status;
      currentJobId = payload.job_id;
      jobIdField.textContent = `Job #${payload.job_id}`;

      if (status === 'succeeded') {
        setStatus('完成', 'success');
        setText('视频已生成，点击下方链接播放。');
        setVideoLink(payload.video_url);
        setError('');
        stopPolling();
      } else if (status === 'failed') {
        setStatus('失败', 'error');
        setText('生成失败，请检查脚本或稍后重试。');
        setVideoLink('');
        setError(payload.error || '未知错误');
        stopPolling();
      } else {
        setStatus('生成中', 'warning');
        setText('后台正在调用视频引擎并轮询任务状态…');
        setVideoLink('');
        setError('');
      }
    } catch (err) {
      setStatus('异常', 'error');
      setText('无法获取最新状态');
      setError(err.message);
      stopPolling();
    }
  };

  const startPolling = (jobId) => {
    stopPolling();
    pollJob(jobId);
    pollTimer = setInterval(() => pollJob(jobId), 5000);
  };

  if (form) {
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      setError('');
      setVideoLink('');
      stopPolling();

      const payload = {
        script: form.script.value.trim(),
        duration: form.duration.value,
        aspect_ratio: form.aspect_ratio.value,
        style: form.style.value,
        voice_lang: form.voice_lang.value,
        voice_type: form.voice_type.value,
        template_id: form.template_id.value,
      };

      if (!payload.script) {
        setStatus('缺少脚本', 'error');
        setText('请填写故事脚本再提交。');
        return;
      }

      submitBtn.disabled = true;
      setStatus('提交中', 'warning');
      setText('正在写入任务并调用视频生成服务…');

      try {
        const response = await fetch('/api/videos', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || '提交失败');
        }

        currentJobId = data.job_id;
        jobIdField.textContent = `Job #${currentJobId}`;
        setStatus('生成中', 'warning');
        setText('任务已创建，开始轮询状态…');
        startPolling(currentJobId);
      } catch (err) {
        setStatus('失败', 'error');
        setText('任务提交失败');
        setError(err.message);
      } finally {
        submitBtn.disabled = false;
      }
    });
  }
})();

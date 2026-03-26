import React, { useState, useEffect } from 'react';
import './TaskBoardPanel.css'; // Assume minimal CSS

export function TaskBoardPanel({ bookId }) {
    const [tasks, setTasks] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!bookId) return;
        fetchTasks();
        const interval = setInterval(fetchTasks, 5000);
        return () => clearInterval(interval);
    }, [bookId]);

    const fetchTasks = async () => {
        try {
            const res = await fetch(`/api/v1/books/${bookId}/tasks`);
            if (res.ok) {
                const data = await res.json();
                setTasks(data);
            }
        } catch (e) {
            console.error("Fetch tasks failed", e);
        } finally {
            setLoading(false);
        }
    };

    const handleApprove = async (taskId) => {
        await fetch(`/api/v1/books/${bookId}/tasks/${taskId}/approve`, { method: "POST" });
        fetchTasks();
    };

    const handleReject = async (taskId) => {
        const feedback = prompt("提供反馈意见:");
        if (!feedback) return;
        await fetch(`/api/v1/books/${bookId}/tasks/${taskId}/reject`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ feedback })
        });
        fetchTasks();
    };

    if (!bookId) return <div className="p-4 text-gray-500">请先选择或创建一本书</div>;
    if (loading) return <div className="p-4 text-gray-500">加载任务列表中...</div>;

    return (
        <div className="task-board bg-base-100 h-full flex flex-col pt-8">
            <h2 className="text-xl font-bold mb-4 px-4 sticky top-0 bg-base-100 z-10 pt-4">写作任务看板</h2>
            <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-4">
                {tasks.length === 0 ? (
                    <div className="text-center text-gray-500 mt-10">暂无任务</div>
                ) : (
                    tasks.map(task => (
                        <div key={task.id} className={`card bg-base-200 shadow-sm border-l-4 ${getStatusColor(task.status)}`}>
                            <div className="card-body p-4">
                                <div className="flex justify-between items-start">
                                    <h3 className="font-bold text-lg">{task.type}</h3>
                                    <span className={`badge ${getStatusBadge(task.status)}`}>{getStatusText(task.status)}</span>
                                </div>
                                <p className="text-sm text-gray-500 mt-2">
                                    场景ID: {task.payload?.scene_id || 'N/A'}
                                </p>
                                
                                {task.payload?.draft_text && (
                                    <div className="mt-4">
                                        <h4 className="font-semibold text-sm mb-1">正文草稿:</h4>
                                        <div className="bg-base-300 p-3 rounded-lg text-sm whitespace-pre-wrap max-h-40 overflow-y-auto">
                                            {task.payload.draft_text}
                                        </div>
                                    </div>
                                )}
                                
                                {task.payload?.editor_feedback && (
                                    <div className="mt-4">
                                        <h4 className="font-semibold text-sm mb-1 text-warning">编辑反馈:</h4>
                                        <div className="bg-warning/10 text-warning-content p-3 rounded-lg text-sm whitespace-pre-wrap">
                                            {task.payload.editor_feedback}
                                        </div>
                                    </div>
                                )}

                                {task.status === "human_approval_pending" && (
                                    <div className="card-actions justify-end mt-4">
                                        <button className="btn btn-sm btn-error" onClick={() => handleReject(task.id)}>拒绝重写</button>
                                        <button className="btn btn-sm btn-success" onClick={() => handleApprove(task.id)}>通过并保存</button>
                                    </div>
                                )}
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}

function getStatusColor(status) {
    switch (status) {
        case 'drafting': return 'border-info';
        case 'editorial_review': return 'border-warning';
        case 'human_approval_pending': return 'border-primary';
        case 'completed': return 'border-success';
        case 'error': return 'border-error';
        default: return 'border-gray-500';
    }
}

function getStatusBadge(status) {
    switch (status) {
        case 'drafting': return 'badge-info';
        case 'editorial_review': return 'badge-warning';
        case 'human_approval_pending': return 'badge-primary';
        case 'completed': return 'badge-success';
        case 'error': return 'badge-error';
        default: return 'badge-ghost';
    }
}

function getStatusText(status) {
    switch (status) {
        case 'drafting': return '正在撰写中...';
        case 'editorial_review': return '编辑审核中...';
        case 'human_approval_pending': return '待您审批';
        case 'completed': return '已完成';
        case 'error': return '出错了';
        default: return status;
    }
}

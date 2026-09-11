'use client';

import { useEffect, useRef, useState } from 'react';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { FieldLabel, Input } from '@/components/ui/input';

export function SignaturePad({
  open,
  onClose,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: (dataUrl: string) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [typed, setTyped] = useState('');
  const [empty, setEmpty] = useState(true);

  useEffect(() => {
    if (!open) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    setEmpty(true);
    setTyped('');
  }, [open]);

  const point = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const r = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - r.left) / r.width) * canvas.width,
      y: ((e.clientY - r.top) / r.height) * canvas.height,
    };
  };

  const clear = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    setEmpty(true);
  };

  const stampTyped = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx || !typed.trim()) return;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#111827';
    ctx.font = 'italic 54px Georgia, serif';
    ctx.textBaseline = 'middle';
    ctx.fillText(typed.trim(), 28, canvas.height / 2, canvas.width - 56);
    setEmpty(false);
  };

  const confirm = () => {
    const canvas = canvasRef.current;
    if (!canvas || empty) return;
    onConfirm(canvas.toDataURL('image/png'));
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Signature"
      meta="Draw or type a signature. It stays in this browser session."
      maxWidth="max-w-lg"
      footer={
        <div className="flex w-full items-center justify-between gap-2">
          <Button variant="ghost" onClick={clear}>
            Clear
          </Button>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="primary" onClick={confirm} disabled={empty}>
              Place signature
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        <canvas
          ref={canvasRef}
          width={640}
          height={220}
          className="h-[180px] w-full cursor-crosshair rounded-xl border border-line bg-white"
          onPointerDown={(e) => {
            const canvas = canvasRef.current;
            const ctx = canvas?.getContext('2d');
            if (!canvas || !ctx) return;
            drawing.current = true;
            canvas.setPointerCapture(e.pointerId);
            const p = point(e);
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.strokeStyle = '#111827';
            ctx.lineWidth = 2.6;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
          }}
          onPointerMove={(e) => {
            if (!drawing.current) return;
            const ctx = canvasRef.current?.getContext('2d');
            if (!ctx) return;
            const p = point(e);
            ctx.lineTo(p.x, p.y);
            ctx.stroke();
            setEmpty(false);
          }}
          onPointerUp={() => {
            drawing.current = false;
          }}
        />
        <div>
          <FieldLabel>Or type a name</FieldLabel>
          <div className="flex gap-2">
            <Input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="Your name" />
            <Button variant="secondary" onClick={stampTyped} disabled={!typed.trim()}>
              Apply
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

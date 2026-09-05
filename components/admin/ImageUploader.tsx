'use client';

import Image from 'next/image';
import { useRef, useState } from 'react';
import { Upload, X, Loader2, Image as ImageIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useT } from '@/lib/i18n/client';

interface Props {
  value: string;
  onChange: (url: string) => void;
  folder?: 'products' | 'workers' | 'categories' | 'misc';
  label?: string;
  helperText?: string;
}

export function ImageUploader({
  value,
  onChange,
  folder = 'products',
  helperText,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const ka = useT();
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFile = async (file: File) => {
    setError(null);
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('folder', folder);
      const res = await fetch('/api/upload', { method: 'POST', body: formData });
      const json = await res.json();
      if (!res.ok || json.error) {
        setError(json.error ?? ka.imageUploader.uploadError);
        return;
      }
      onChange(json.data.url);
    } catch (e) {
      console.error(e);
      setError(ka.imageUploader.uploadError);
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-4">
        <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-lg border border-line bg-bg-base">
          {value ? (
            <Image
              src={value}
              alt="preview"
              fill
              sizes="96px"
              className="object-cover"
              unoptimized={value.startsWith('/')}
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-ink-muted">
              <ImageIcon className="h-7 w-7" />
            </div>
          )}
        </div>

        <div className="flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => inputRef.current?.click()}
              disabled={uploading}
            >
              {uploading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Upload className="h-4 w-4" />
              )}
              {ka.imageUploader.upload}
            </Button>
            {value && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => onChange('')}
                disabled={uploading}
              >
                <X className="h-4 w-4" />
                {ka.imageUploader.remove}
              </Button>
            )}
          </div>
          <Input
            placeholder={ka.imageUploader.urlPlaceholder}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            disabled={uploading}
          />
          {helperText && (
            <p className="text-xs text-ink-muted">{helperText}</p>
          )}
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleFile(file);
        }}
      />

      {error && (
        <p className="rounded-md border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

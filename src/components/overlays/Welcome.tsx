import {useEffect, useState} from 'react';
import {pickRom, tryLoadCachedRom} from '../../lib/files';
import {DISCORD_URL, DiscordIcon, GITHUB_URL, GitHubIcon} from './SocialLinks';

const noop = () => {};

export function Welcome() {
  const [checkingCache, setCheckingCache] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void tryLoadCachedRom(noop).then(loaded => {
      if (!cancelled && !loaded) setCheckingCache(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (checkingCache) return null;

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-5 text-center">
      <img src="/favicon.svg" alt="Crystalis Tools" className="h-16 w-16" />
      <div>
        <div className="text-lg font-semibold text-neutral-100">Crystalis Tools</div>
        <div className="mt-1 text-sm text-neutral-500">
          A browser-based ROM editor for Crystalis (NES)
        </div>
        <p className="mx-auto mt-3 max-w-sm text-xs leading-relaxed text-neutral-400">
          Explore and edit maps, NPCs, items, shops, flags and triggers directly
          against the ROM, then export a BPS patch — useful for randomizers,
          translations, bugfix hacks and general ROM-hacking experimentation.
        </p>
      </div>
      <button
          type="button"
          onClick={() => pickRom(noop)}
          className="mt-2 rounded-[10px] border border-[#5b6472] bg-[#4b5563] px-6 py-3 font-semibold text-[#e5e7eb] hover:bg-[#5b6472]">
        Load ROM…
      </button>
      <div className="flex items-center gap-3">
        <a
            href={GITHUB_URL}
            target="_blank"
            rel="noopener noreferrer"
            title="GitHub"
            className="flex items-center justify-center rounded-[10px] border border-neutral-800 p-2 text-neutral-400 hover:border-neutral-700 hover:text-neutral-100">
          <GitHubIcon className="h-5 w-5" />
        </a>
        <a
            href={DISCORD_URL}
            target="_blank"
            rel="noopener noreferrer"
            title="Discord"
            className="flex items-center justify-center rounded-[10px] border border-neutral-800 p-2 text-neutral-400 hover:border-neutral-700 hover:text-neutral-100">
          <DiscordIcon className="h-5 w-5" />
        </a>
      </div>
    </div>
  );
}

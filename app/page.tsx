import Link from 'next/link';
import styles from './page.module.css';

export default function HomePage() {
  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1>Gravity Guitar 吉他练习</h1>
      </div>

      <div className={styles.navGrid}>
        <Link href="/interval-exercises" className={`${styles.card} ${styles.earTrainer}`}>
          <div className={styles.cardIcon}>🎯</div>
          <div className={styles.cardTitle}>音程听辨练习</div>
          <div className={styles.cardDesc}>
            通过持续背景音锚定调性中心，训练用直觉锁定音程色彩而非数半音
          </div>
          <div className={styles.cardTags}>
            <span className={styles.tag}>练耳</span>
            <span className={styles.tag}>音程</span>
            <span className={styles.tag}>Web Audio</span>
          </div>
        </Link>

        <Link href="/guitar-radar" className={`${styles.card} ${styles.radarTrainer}`}>
          <div className={styles.cardIcon}>📡</div>
          <div className={styles.cardTitle}>吉他找音练习</div>
          <div className={styles.cardDesc}>
            随机出题指定弦上的音名，在限定时间内找到对应品丝位置，切断视觉依赖
          </div>
          <div className={styles.cardTags}>
            <span className={styles.tag}>指板</span>
            <span className={styles.tag}>根音</span>
            <span className={styles.tag}>肌肉记忆</span>
          </div>
        </Link>

        <Link href="/lyric-practice" className={`${styles.card} ${styles.sequencerTrainer}`}>
          <div className={styles.cardIcon}>🎛</div>
          <div className={styles.cardTitle}>视唱旋律生成</div>
          <div className={styles.cardDesc}>
            钢琴卷帘风格网格编辑，支持音阶过滤、音域裁剪、随机视唱出题与播放
          </div>
          <div className={styles.cardTags}>
            <span className={styles.tag}>视唱</span>
            <span className={styles.tag}>音序器</span>
            <span className={styles.tag}>随机生成</span>
          </div>
        </Link>
      </div>

      <div className={styles.footer}>gravity-guitar · next.js + react</div>
    </div>
  );
}

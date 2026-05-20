/**
 * Korean holiday / commercial / cultural event database.
 *
 * Each entry uses `MM-DD` (no year) — the date is interpreted in the current
 * year. The list intentionally covers 2025-2026 but the data is recurring
 * (anniversaries, Day-of-the-month commercial events, seasonal events) so it
 * stays useful year over year. Lunar-based moving holidays (설날 / 추석) need
 * yearly review.
 *
 * Categories:
 *  - holiday      : statutory public holiday
 *  - commercial   : marketing / Day-series (e.g. 발렌타인데이, 빼빼로데이)
 *  - traditional  : 절기 / 명절
 *  - event        : awareness / observance day
 *  - shopping     : sale-season anchor dates
 */

export type EventType =
  | 'holiday'
  | 'commercial'
  | 'traditional'
  | 'event'
  | 'shopping';

export interface KoreanEvent {
  /** `MM-DD` */
  date: string;
  name: string;
  type: EventType;
  contentIdeas: string[];
  priority: 'low' | 'medium' | 'high';
}

export const KOREAN_EVENTS_DB: KoreanEvent[] = [
  // ===== 공휴일 (Statutory holidays) =====
  { date: '01-01', name: '새해', type: 'holiday', contentIdeas: ['신년 계획', '새해 다짐', '2025 트렌드'], priority: 'high' },
  { date: '01-27', name: '설날 연휴 시작', type: 'holiday', contentIdeas: ['귀성길 팁', '고속도로 정보'], priority: 'high' },
  { date: '01-28', name: '설날 연휴', type: 'holiday', contentIdeas: ['설날 음식', '세뱃돈', '귀성길 팁'], priority: 'high' },
  { date: '01-29', name: '설날', type: 'holiday', contentIdeas: ['설날 인사말', '전통 놀이', '가족 모임'], priority: 'high' },
  { date: '01-30', name: '설날 연휴 마지막', type: 'holiday', contentIdeas: ['유턴 정보', '설 연휴 마무리'], priority: 'medium' },
  { date: '03-01', name: '삼일절', type: 'holiday', contentIdeas: ['독립운동', '역사 콘텐츠', '태극기 게양'], priority: 'medium' },
  { date: '05-05', name: '어린이날', type: 'holiday', contentIdeas: ['선물 추천', '가족 나들이', '키즈 콘텐츠'], priority: 'high' },
  { date: '05-06', name: '대체공휴일', type: 'holiday', contentIdeas: ['황금연휴', '여행지 추천'], priority: 'medium' },
  { date: '05-15', name: '부처님오신날', type: 'holiday', contentIdeas: ['사찰 여행', '템플스테이', '연등 축제'], priority: 'medium' },
  { date: '06-06', name: '현충일', type: 'holiday', contentIdeas: ['호국 영웅', '추모 콘텐츠', '국립묘지'], priority: 'medium' },
  { date: '08-15', name: '광복절', type: 'holiday', contentIdeas: ['독립 역사', '애국 콘텐츠', '광복절 행사'], priority: 'medium' },
  { date: '10-03', name: '개천절', type: 'holiday', contentIdeas: ['단군 신화', '한국 역사', '건국이념'], priority: 'medium' },
  { date: '10-05', name: '추석 연휴 시작', type: 'holiday', contentIdeas: ['추석 준비', '귀성 정보'], priority: 'high' },
  { date: '10-06', name: '추석', type: 'holiday', contentIdeas: ['가족 모임', '성묘', '보름달', '송편'], priority: 'high' },
  { date: '10-07', name: '추석 연휴', type: 'holiday', contentIdeas: ['추석 음식', '한복', '전통놀이'], priority: 'high' },
  { date: '10-08', name: '추석 연휴 마지막', type: 'holiday', contentIdeas: ['유턴 정보', '연휴 마무리'], priority: 'medium' },
  { date: '10-09', name: '한글날', type: 'holiday', contentIdeas: ['한글 사랑', '세종대왕', '국어 콘텐츠'], priority: 'medium' },
  { date: '12-25', name: '크리스마스', type: 'holiday', contentIdeas: ['크리스마스 선물', '연말 분위기', '캐롤', '트리'], priority: 'high' },

  // ===== Day 시리즈 (Commercial 14th-of-month days) =====
  { date: '01-14', name: '다이어리데이', type: 'commercial', contentIdeas: ['다이어리 추천', '플래너 꾸미기', '신년 계획'], priority: 'low' },
  { date: '02-14', name: '발렌타인데이', type: 'commercial', contentIdeas: ['초콜릿 추천', '커플 데이트', '고백 팁', 'DIY 초콜릿'], priority: 'high' },
  { date: '03-14', name: '화이트데이', type: 'commercial', contentIdeas: ['사탕 선물', '답례 아이디어', '데이트 코스'], priority: 'high' },
  { date: '04-14', name: '블랙데이', type: 'commercial', contentIdeas: ['자장면', '솔로 위로', '혼밥 맛집'], priority: 'medium' },
  { date: '05-14', name: '로즈데이', type: 'commercial', contentIdeas: ['장미 선물', '데이트 코스', '꽃 카페'], priority: 'medium' },
  { date: '06-14', name: '키스데이', type: 'commercial', contentIdeas: ['커플 콘텐츠', '연애 팁'], priority: 'low' },
  { date: '07-14', name: '실버데이', type: 'commercial', contentIdeas: ['어른 선물', '효도 콘텐츠', '부모님 소개'], priority: 'low' },
  { date: '08-14', name: '그린데이', type: 'commercial', contentIdeas: ['야외 데이트', '소풍', '숲 캠핑'], priority: 'low' },
  { date: '09-14', name: '포토데이', type: 'commercial', contentIdeas: ['커플 사진', '포토존', '인생샷 명소'], priority: 'medium' },
  { date: '10-14', name: '와인데이', type: 'commercial', contentIdeas: ['와인 추천', '분위기 있는 데이트', '와인바'], priority: 'medium' },
  { date: '11-14', name: '무비데이', type: 'commercial', contentIdeas: ['영화 추천', '영화관 데이트', '넷플릭스'], priority: 'medium' },
  { date: '12-14', name: '허그데이', type: 'commercial', contentIdeas: ['겨울 데이트', '따뜻한 콘텐츠'], priority: 'low' },

  // ===== 가정 / 효도 (Family / filial) =====
  { date: '05-08', name: '어버이날', type: 'commercial', contentIdeas: ['부모님 선물', '효도 여행', '카네이션', '감사 편지'], priority: 'high' },
  { date: '05-15', name: '스승의날', type: 'event', contentIdeas: ['감사 편지', '선생님 선물', '은사 감사'], priority: 'medium' },
  { date: '05-21', name: '부부의날', type: 'commercial', contentIdeas: ['부부 여행', '결혼 기념', '데이트'], priority: 'medium' },
  { date: '07-07', name: '칠석', type: 'traditional', contentIdeas: ['견우직녀', '전통 이야기', '별 보기'], priority: 'low' },
  { date: '10-02', name: '노인의날', type: 'event', contentIdeas: ['효도 콘텐츠', '어르신 선물', '경로당 봉사'], priority: 'low' },
  { date: '11-22', name: '좋은 부부의 날', type: 'commercial', contentIdeas: ['부부 선물', '결혼 기념일'], priority: 'low' },
  { date: '05-02', name: '근로자의 날', type: 'event', contentIdeas: ['직장인 위로', '워라밸', '번아웃'], priority: 'medium' },
  { date: '08-08', name: '효도의 날', type: 'event', contentIdeas: ['부모님 감사', '효도 선물'], priority: 'low' },

  // ===== 전통 절기 (Traditional / 24 solar terms) =====
  { date: '01-15', name: '정월대보름', type: 'traditional', contentIdeas: ['오곡밥', '부럼 깨기', '달맞이', '쥐불놀이'], priority: 'medium' },
  { date: '02-04', name: '입춘', type: 'traditional', contentIdeas: ['봄 시작', '입춘대길', '새해 다짐'], priority: 'low' },
  { date: '03-05', name: '경칩', type: 'traditional', contentIdeas: ['봄 날씨', '개구리', '봄맞이'], priority: 'low' },
  { date: '04-05', name: '식목일', type: 'event', contentIdeas: ['나무 심기', '환경 콘텐츠', '에코라이프'], priority: 'medium' },
  { date: '04-20', name: '곡우', type: 'traditional', contentIdeas: ['봄비', '농사 시작', '차 마시기'], priority: 'low' },
  { date: '05-05', name: '단오', type: 'traditional', contentIdeas: ['창포물 머리감기', '그네뛰기', '씨름'], priority: 'low' },
  { date: '06-21', name: '하지', type: 'traditional', contentIdeas: ['여름 시작', '가장 긴 낮', '더위 준비'], priority: 'low' },
  { date: '07-18', name: '초복', type: 'traditional', contentIdeas: ['삼계탕', '보양식', '더위 극복'], priority: 'medium' },
  { date: '07-28', name: '중복', type: 'traditional', contentIdeas: ['삼계탕', '보양식', '여름 건강'], priority: 'medium' },
  { date: '08-07', name: '말복', type: 'traditional', contentIdeas: ['삼계탕', '여름 마무리', '가을 준비'], priority: 'medium' },
  { date: '08-23', name: '처서', type: 'traditional', contentIdeas: ['더위 끝', '가을 시작', '환절기'], priority: 'low' },
  { date: '09-23', name: '추분', type: 'traditional', contentIdeas: ['밤낮 같음', '가을 본격', '단풍'], priority: 'low' },
  { date: '11-07', name: '입동', type: 'traditional', contentIdeas: ['겨울 시작', '김장철', '월동 준비'], priority: 'medium' },
  { date: '12-21', name: '동지', type: 'traditional', contentIdeas: ['팥죽', '가장 긴 밤', '동지팥죽'], priority: 'medium' },
  { date: '07-17', name: '제헌절', type: 'event', contentIdeas: ['헌법 이야기', '민주주의', '법치주의'], priority: 'low' },

  // ===== 글로벌 / 상업 (Global / commercial) =====
  { date: '10-31', name: '할로윈', type: 'commercial', contentIdeas: ['코스튬', '할로윈 파티', '공포 콘텐츠', '할로윈 메이크업'], priority: 'high' },
  { date: '11-11', name: '빼빼로데이', type: 'commercial', contentIdeas: ['빼빼로 만들기', '선물 포장', 'DIY', '꾸미기'], priority: 'high' },
  { date: '11-29', name: '블랙프라이데이', type: 'commercial', contentIdeas: ['할인 정보', '쇼핑 리스트', '구매 가이드', '직구'], priority: 'high' },
  { date: '12-02', name: '사이버먼데이', type: 'commercial', contentIdeas: ['온라인 할인', '전자제품', '쇼핑 팁'], priority: 'medium' },
  { date: '12-26', name: '박싱데이', type: 'commercial', contentIdeas: ['연말 세일', '크리스마스 후 쇼핑'], priority: 'low' },
  { date: '04-01', name: '만우절', type: 'event', contentIdeas: ['장난 아이디어', '몰래카메라', '유머'], priority: 'medium' },
  { date: '04-22', name: '지구의날', type: 'event', contentIdeas: ['환경보호', '에코라이프', '제로웨이스트'], priority: 'medium' },
  { date: '03-08', name: '세계 여성의 날', type: 'event', contentIdeas: ['여성 리더', '젠더 평등', '워킹맘'], priority: 'medium' },
  { date: '03-22', name: '세계 물의 날', type: 'event', contentIdeas: ['물 절약', '환경'], priority: 'low' },
  { date: '06-05', name: '세계 환경의 날', type: 'event', contentIdeas: ['환경보호', '플라스틱 줄이기'], priority: 'medium' },
  { date: '09-21', name: '세계 평화의 날', type: 'event', contentIdeas: ['평화', '힐링'], priority: 'low' },
  { date: '10-10', name: '세계 정신건강의 날', type: 'event', contentIdeas: ['멘탈케어', '스트레스 관리', '마음 건강'], priority: 'medium' },
  { date: '11-19', name: '세계 남성의 날', type: 'event', contentIdeas: ['남성 건강', '아버지'], priority: 'low' },
  { date: '12-01', name: '세계 에이즈의 날', type: 'event', contentIdeas: ['건강 정보', '예방'], priority: 'low' },
  { date: '02-04', name: '세계 암의 날', type: 'event', contentIdeas: ['암 예방', '건강 검진'], priority: 'low' },

  // ===== 학교 / 입시 (School / college admissions) =====
  { date: '03-02', name: '개학', type: 'event', contentIdeas: ['새학기 준비', '학용품', '학교생활'], priority: 'medium' },
  { date: '06-01', name: '수능 D-180', type: 'event', contentIdeas: ['수험생 응원', '공부 팁', '학습 전략'], priority: 'low' },
  { date: '09-01', name: '수능 D-100', type: 'event', contentIdeas: ['수험생 응원', '집중 공부법'], priority: 'medium' },
  { date: '11-14', name: '수능', type: 'event', contentIdeas: ['수능 응원', '수능 후 계획', '대입 전략'], priority: 'high' },
  { date: '12-15', name: '대학 원서 마감', type: 'event', contentIdeas: ['대입 정보', '자소서 팁'], priority: 'medium' },
  { date: '02-01', name: '졸업시즌', type: 'event', contentIdeas: ['졸업 선물', '졸업 사진', '졸업 축하'], priority: 'medium' },
  { date: '03-01', name: '입학시즌', type: 'event', contentIdeas: ['입학 선물', '학교 준비', '신입생 팁'], priority: 'medium' },
  { date: '07-20', name: '여름방학 시작', type: 'event', contentIdeas: ['방학 계획', '여름 캠프', '체험학습'], priority: 'medium' },
  { date: '08-20', name: '개학 준비', type: 'event', contentIdeas: ['2학기 준비', '학용품 쇼핑'], priority: 'low' },
  { date: '12-20', name: '겨울방학 시작', type: 'event', contentIdeas: ['겨울 방학', '스키', '해외여행'], priority: 'medium' },

  // ===== 쇼핑 시즌 (Shopping seasons) =====
  { date: '01-02', name: '신년 세일 시즌', type: 'shopping', contentIdeas: ['할인 정보', '신년 쇼핑', '가전 세일'], priority: 'high' },
  { date: '04-01', name: '봄 세일 시작', type: 'shopping', contentIdeas: ['봄 패션', '아우터', '봄 신상'], priority: 'medium' },
  { date: '06-01', name: '여름 세일 시작', type: 'shopping', contentIdeas: ['여름 패션', '에어컨', '휴가 준비'], priority: 'high' },
  { date: '07-15', name: '여름 중간 세일', type: 'shopping', contentIdeas: ['여름 할인', '시즌오프'], priority: 'medium' },
  { date: '09-01', name: '가을 신상', type: 'shopping', contentIdeas: ['가을 패션', '트렌치코트', '니트'], priority: 'high' },
  { date: '10-15', name: '가을 세일', type: 'shopping', contentIdeas: ['가을 할인', '겨울 준비'], priority: 'medium' },
  { date: '11-01', name: '프리블랙프라이데이', type: 'shopping', contentIdeas: ['얼리버드 할인', '쇼핑 준비'], priority: 'medium' },
  { date: '12-01', name: '연말 세일 시즌', type: 'shopping', contentIdeas: ['선물 추천', '연말 쇼핑', '크리스마스'], priority: 'high' },
  { date: '12-26', name: '연말 정리 세일', type: 'shopping', contentIdeas: ['재고 정리', '추가 할인'], priority: 'medium' },
  { date: '08-15', name: '가전 할인대전', type: 'shopping', contentIdeas: ['가전제품', '에어컨', '냉장고'], priority: 'medium' },

  // ===== 시즌 / 날씨 (Season / weather) =====
  { date: '12-31', name: '연말', type: 'event', contentIdeas: ['연말 정산', '올해의 회고', '새해 계획', '카운트다운'], priority: 'high' },
  { date: '03-20', name: '봄 시작', type: 'event', contentIdeas: ['봄맞이', '봄 패션', '봄 나들이'], priority: 'medium' },
  { date: '04-10', name: '벚꽃 시즌', type: 'event', contentIdeas: ['벚꽃 명소', '벚꽃 사진', '봄 피크닉'], priority: 'high' },
  { date: '05-01', name: '가정의 달 시작', type: 'event', contentIdeas: ['가족 이벤트', '효도', '어린이날 준비'], priority: 'medium' },
  { date: '07-01', name: '여름휴가 시즌', type: 'event', contentIdeas: ['휴가지 추천', '바캉스', '물놀이'], priority: 'high' },
  { date: '08-01', name: '휴가 피크 시즌', type: 'event', contentIdeas: ['피서지', '워터파크', '해외여행'], priority: 'high' },
  { date: '10-20', name: '단풍 시즌', type: 'event', contentIdeas: ['단풍 명소', '가을 산행', '드라이브'], priority: 'medium' },
  { date: '11-15', name: '김장철', type: 'event', contentIdeas: ['김장 레시피', '김치 담그기', '김장 재료'], priority: 'medium' },
  { date: '12-15', name: '연말 파티 시즌', type: 'event', contentIdeas: ['송년회', '연말 파티', '홈파티'], priority: 'medium' },
  { date: '06-15', name: '장마 시작', type: 'event', contentIdeas: ['장마 대비', '우산', '레인부츠'], priority: 'medium' },
  { date: '01-10', name: '한파 시즌', type: 'event', contentIdeas: ['한파 대비', '방한용품', '겨울철 건강'], priority: 'medium' },
  { date: '07-25', name: '폭염 시즌', type: 'event', contentIdeas: ['폭염 대비', '에어컨', '열사병 예방'], priority: 'medium' },

  // ===== 크리에이터 특화 (Creator-specific) =====
  { date: '01-10', name: '연간 콘텐츠 기획', type: 'event', contentIdeas: ['연간 계획', '콘텐츠 전략', '채널 목표'], priority: 'medium' },
  { date: '04-15', name: '유튜브 알고리즘 시즌', type: 'event', contentIdeas: ['알고리즘 팁', '조회수 올리기'], priority: 'low' },
  { date: '06-20', name: '여름 콘텐츠 기획', type: 'event', contentIdeas: ['여름 브이로그', '휴가 콘텐츠'], priority: 'medium' },
  { date: '09-15', name: '가을 콘텐츠 시즌', type: 'event', contentIdeas: ['가을 감성', 'ASMR', '독서'], priority: 'medium' },
  { date: '11-25', name: '연말 콘텐츠 준비', type: 'event', contentIdeas: ['연말 기획', '베스트 영상', '회고'], priority: 'medium' },
  { date: '03-15', name: '봄 브랜드 콜라보 시즌', type: 'event', contentIdeas: ['브랜드 협업', 'PPL', '협찬'], priority: 'low' },
  { date: '10-01', name: '구독자 이벤트 시즌', type: 'event', contentIdeas: ['구독자 감사', '이벤트', '선물'], priority: 'low' },
  { date: '12-10', name: '연말결산 콘텐츠', type: 'event', contentIdeas: ['올해의 정리', '베스트 모음', '연말 특집'], priority: 'medium' },
];

/**
 * Returns events occurring within the next `days` calendar days, sorted by
 * `days_until`. Used by tools/koreanEvents.ts and tools/contentIdeas.ts.
 */
export function getUpcomingEvents(
  days: number,
  now: Date = new Date(),
): Array<KoreanEvent & { days_until: number; date_full: string }> {
  const upcoming: Array<KoreanEvent & { days_until: number; date_full: string }> = [];

  for (let i = 0; i < days; i++) {
    const checkDate = new Date(now);
    checkDate.setDate(now.getDate() + i);
    const dateStr = `${String(checkDate.getMonth() + 1).padStart(2, '0')}-${String(checkDate.getDate()).padStart(2, '0')}`;

    const event = KOREAN_EVENTS_DB.find((e) => e.date === dateStr);
    if (event) {
      upcoming.push({
        ...event,
        days_until: i,
        date_full: checkDate.toISOString().split('T')[0],
      });
    }
  }

  return upcoming;
}

/**
 * All events whose `MM-DD` falls within the given calendar year.
 * Used by the `resource://content-genie/korean-events/{year}` MCP resource.
 */
export function getEventsForYear(year: number): Array<KoreanEvent & { date_full: string }> {
  return KOREAN_EVENTS_DB.map((e) => ({
    ...e,
    date_full: `${year}-${e.date}`,
  })).sort((a, b) => a.date.localeCompare(b.date));
}

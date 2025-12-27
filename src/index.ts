#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { z } from "zod";
import axios from "axios";
import * as cheerio from "cheerio";
import express, { Request, Response } from "express";
import cors from "cors";
import crypto from "crypto";

// =============================================================================
// Content Genie MCP v2.5 - 한국 콘텐츠 크리에이터를 위한 AI 어시스턴트 (프로 버전)
// =============================================================================

const server = new McpServer({
  name: "content-genie-mcp",
  version: "2.9.3",
});

// =============================================================================
// 공통 스키마
// =============================================================================

const TrendPlatformSchema = z.enum(["naver", "google", "youtube", "daum", "zum", "all"]);
const TrendCategorySchema = z.enum(["general", "news", "shopping", "entertainment", "tech", "finance", "sports", "all"]);
const ContentTypeSchema = z.enum(["blog", "youtube", "instagram", "tiktok", "newsletter", "threads", "twitter", "all"]);
const ToneSchema = z.enum(["professional", "casual", "humorous", "educational", "inspirational", "provocative", "storytelling"]);

// =============================================================================
// 실시간 트렌드 캐시 시스템
// =============================================================================

interface TrendCache {
  data: any[];
  timestamp: number;
  source: string;
}

const TREND_CACHE: Record<string, TrendCache> = {};
const CACHE_TTL = 30 * 60 * 1000; // 30분

function getCachedTrends(platform: string): any[] | null {
  const cache = TREND_CACHE[platform];
  if (cache && Date.now() - cache.timestamp < CACHE_TTL) {
    return cache.data;
  }
  return null;
}

function setCachedTrends(platform: string, data: any[], source: string): void {
  TREND_CACHE[platform] = { data, timestamp: Date.now(), source };
}

// 시즌/시간 기반 동적 키워드 생성기
function generateDynamicKeywords(): { seasonal: string[], timeBase: string[], evergreen: string[] } {
  const now = new Date();
  const month = now.getMonth() + 1;
  const hour = now.getHours();
  const dayOfWeek = now.getDay();
  const date = now.getDate();

  // 계절별 키워드
  const seasonalKeywords: Record<string, string[]> = {
    winter: ["겨울 패션", "핫초코", "스키장", "연말 파티", "크리스마스 선물", "방한용품"],
    spring: ["봄 나들이", "벚꽃 명소", "봄 패션", "꽃구경", "피크닉", "알레르기"],
    summer: ["여름 휴가", "물놀이", "에어컨", "바캉스", "수박", "썬크림", "휴양지"],
    fall: ["단풍 여행", "가을 패션", "와인", "독서", "캠핑", "고구마", "할로윈"],
  };

  const season = month <= 2 || month === 12 ? "winter"
    : month <= 5 ? "spring"
    : month <= 8 ? "summer" : "fall";

  // 시간대별 키워드
  const timeKeywords = hour >= 6 && hour <= 9
    ? ["아침 루틴", "출근 준비", "모닝커피", "아침 운동", "조식 메뉴"]
    : hour >= 11 && hour <= 14
    ? ["점심 메뉴", "런치 맛집", "오후 카페", "낮잠", "점심 도시락"]
    : hour >= 17 && hour <= 21
    ? ["퇴근 후 활동", "저녁 메뉴", "헬스장", "넷플릭스", "야식", "홈트"]
    : ["심야 콘텐츠", "불면증", "야식 배달", "새벽 감성", "올빼미 생활"];

  // 요일별 키워드
  const dayKeywords = dayOfWeek === 0
    ? ["일요일 브런치", "주말 마무리", "월요병 극복"]
    : dayOfWeek === 5
    ? ["불금", "주말 계획", "금요일 회식"]
    : dayOfWeek === 6
    ? ["토요일 나들이", "주말 여행", "늦잠"]
    : ["평일 루틴", "직장인 팁", "재택근무"];

  // 상시 인기 키워드
  const evergreenKeywords = [
    "AI 활용법", "ChatGPT 팁", "돈 버는 방법", "재테크",
    "다이어트", "운동 루틴", "자기계발", "영어 공부",
    "부업 추천", "N잡", "투잡", "주식 투자",
  ];

  return {
    seasonal: [...seasonalKeywords[season], ...dayKeywords],
    timeBase: timeKeywords,
    evergreen: evergreenKeywords,
  };
}

// 오늘의 이벤트 기반 키워드 생성
function getEventBasedKeywords(): string[] {
  const now = new Date();
  const dateStr = `${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

  // 오늘 및 가까운 이벤트 찾기
  const todayEvent = KOREAN_EVENTS_DB.find(e => e.date === dateStr);
  const keywords: string[] = [];

  if (todayEvent) {
    keywords.push(todayEvent.name);
    keywords.push(...(todayEvent.contentIdeas || []));
  }

  // 3일 이내 이벤트
  for (let i = 1; i <= 3; i++) {
    const futureDate = new Date(now);
    futureDate.setDate(now.getDate() + i);
    const futureDateStr = `${String(futureDate.getMonth() + 1).padStart(2, '0')}-${String(futureDate.getDate()).padStart(2, '0')}`;
    const futureEvent = KOREAN_EVENTS_DB.find(e => e.date === futureDateStr);
    if (futureEvent && futureEvent.priority === "high") {
      keywords.push(`${futureEvent.name} 준비`);
    }
  }

  return keywords;
}

// =============================================================================
// 한국 기념일/이벤트 메가 DB (2025-2026) - 100개 이상
// =============================================================================

const KOREAN_EVENTS_DB = [
  // ===== 공휴일 (14개) =====
  { date: "01-01", name: "새해", type: "holiday", contentIdeas: ["신년 계획", "새해 다짐", "2025 트렌드"], priority: "high" },
  { date: "01-27", name: "설날 연휴 시작", type: "holiday", contentIdeas: ["귀성길 팁", "고속도로 정보"], priority: "high" },
  { date: "01-28", name: "설날 연휴", type: "holiday", contentIdeas: ["설날 음식", "세뱃돈", "귀성길 팁"], priority: "high" },
  { date: "01-29", name: "설날", type: "holiday", contentIdeas: ["설날 인사말", "전통 놀이", "가족 모임"], priority: "high" },
  { date: "01-30", name: "설날 연휴 마지막", type: "holiday", contentIdeas: ["유턴 정보", "설 연휴 마무리"], priority: "medium" },
  { date: "03-01", name: "삼일절", type: "holiday", contentIdeas: ["독립운동", "역사 콘텐츠", "태극기 게양"], priority: "medium" },
  { date: "05-05", name: "어린이날", type: "holiday", contentIdeas: ["선물 추천", "가족 나들이", "키즈 콘텐츠"], priority: "high" },
  { date: "05-06", name: "대체공휴일", type: "holiday", contentIdeas: ["황금연휴", "여행지 추천"], priority: "medium" },
  { date: "05-15", name: "부처님오신날", type: "holiday", contentIdeas: ["사찰 여행", "템플스테이", "연등 축제"], priority: "medium" },
  { date: "06-06", name: "현충일", type: "holiday", contentIdeas: ["호국 영웅", "추모 콘텐츠", "국립묘지"], priority: "medium" },
  { date: "08-15", name: "광복절", type: "holiday", contentIdeas: ["독립 역사", "애국 콘텐츠", "광복절 행사"], priority: "medium" },
  { date: "10-03", name: "개천절", type: "holiday", contentIdeas: ["단군 신화", "한국 역사", "건국이념"], priority: "medium" },
  { date: "10-05", name: "추석 연휴 시작", type: "holiday", contentIdeas: ["추석 준비", "귀성 정보"], priority: "high" },
  { date: "10-06", name: "추석", type: "holiday", contentIdeas: ["가족 모임", "성묘", "보름달", "송편"], priority: "high" },
  { date: "10-07", name: "추석 연휴", type: "holiday", contentIdeas: ["추석 음식", "한복", "전통놀이"], priority: "high" },
  { date: "10-08", name: "추석 연휴 마지막", type: "holiday", contentIdeas: ["유턴 정보", "연휴 마무리"], priority: "medium" },
  { date: "10-09", name: "한글날", type: "holiday", contentIdeas: ["한글 사랑", "세종대왕", "국어 콘텐츠"], priority: "medium" },
  { date: "12-25", name: "크리스마스", type: "holiday", contentIdeas: ["크리스마스 선물", "연말 분위기", "캐롤", "트리"], priority: "high" },

  // ===== 데이 시리즈 (14일 데이) (12개) =====
  { date: "01-14", name: "다이어리데이", type: "commercial", contentIdeas: ["다이어리 추천", "플래너 꾸미기", "신년 계획"], priority: "low" },
  { date: "02-14", name: "발렌타인데이", type: "commercial", contentIdeas: ["초콜릿 추천", "커플 데이트", "고백 팁", "DIY 초콜릿"], priority: "high" },
  { date: "03-14", name: "화이트데이", type: "commercial", contentIdeas: ["사탕 선물", "답례 아이디어", "데이트 코스"], priority: "high" },
  { date: "04-14", name: "블랙데이", type: "commercial", contentIdeas: ["자장면", "솔로 위로", "혼밥 맛집"], priority: "medium" },
  { date: "05-14", name: "로즈데이", type: "commercial", contentIdeas: ["장미 선물", "데이트 코스", "꽃 카페"], priority: "medium" },
  { date: "06-14", name: "키스데이", type: "commercial", contentIdeas: ["커플 콘텐츠", "연애 팁"], priority: "low" },
  { date: "07-14", name: "실버데이", type: "commercial", contentIdeas: ["어른 선물", "효도 콘텐츠", "부모님 소개"], priority: "low" },
  { date: "08-14", name: "그린데이", type: "commercial", contentIdeas: ["야외 데이트", "소풍", "숲 캠핑"], priority: "low" },
  { date: "09-14", name: "포토데이", type: "commercial", contentIdeas: ["커플 사진", "포토존", "인생샷 명소"], priority: "medium" },
  { date: "10-14", name: "와인데이", type: "commercial", contentIdeas: ["와인 추천", "분위기 있는 데이트", "와인바"], priority: "medium" },
  { date: "11-14", name: "무비데이", type: "commercial", contentIdeas: ["영화 추천", "영화관 데이트", "넷플릭스"], priority: "medium" },
  { date: "12-14", name: "허그데이", type: "commercial", contentIdeas: ["겨울 데이트", "따뜻한 콘텐츠"], priority: "low" },

  // ===== 가정/효도 관련 (8개) =====
  { date: "05-08", name: "어버이날", type: "commercial", contentIdeas: ["부모님 선물", "효도 여행", "카네이션", "감사 편지"], priority: "high" },
  { date: "05-15", name: "스승의날", type: "event", contentIdeas: ["감사 편지", "선생님 선물", "은사 감사"], priority: "medium" },
  { date: "05-21", name: "부부의날", type: "commercial", contentIdeas: ["부부 여행", "결혼 기념", "데이트"], priority: "medium" },
  { date: "07-07", name: "칠석", type: "traditional", contentIdeas: ["견우직녀", "전통 이야기", "별 보기"], priority: "low" },
  { date: "10-02", name: "노인의날", type: "event", contentIdeas: ["효도 콘텐츠", "어르신 선물", "경로당 봉사"], priority: "low" },
  { date: "11-22", name: "좋은 부부의 날", type: "commercial", contentIdeas: ["부부 선물", "결혼 기념일"], priority: "low" },
  { date: "05-02", name: "근로자의 날", type: "event", contentIdeas: ["직장인 위로", "워라밸", "번아웃"], priority: "medium" },
  { date: "08-08", name: "효도의 날", type: "event", contentIdeas: ["부모님 감사", "효도 선물"], priority: "low" },

  // ===== 전통 절기/명절 (15개) =====
  { date: "01-15", name: "정월대보름", type: "traditional", contentIdeas: ["오곡밥", "부럼 깨기", "달맞이", "쥐불놀이"], priority: "medium" },
  { date: "02-04", name: "입춘", type: "traditional", contentIdeas: ["봄 시작", "입춘대길", "새해 다짐"], priority: "low" },
  { date: "03-05", name: "경칩", type: "traditional", contentIdeas: ["봄 날씨", "개구리", "봄맞이"], priority: "low" },
  { date: "04-05", name: "식목일", type: "event", contentIdeas: ["나무 심기", "환경 콘텐츠", "에코라이프"], priority: "medium" },
  { date: "04-20", name: "곡우", type: "traditional", contentIdeas: ["봄비", "농사 시작", "차 마시기"], priority: "low" },
  { date: "05-05", name: "단오", type: "traditional", contentIdeas: ["창포물 머리감기", "그네뛰기", "씨름"], priority: "low" },
  { date: "06-21", name: "하지", type: "traditional", contentIdeas: ["여름 시작", "가장 긴 낮", "더위 준비"], priority: "low" },
  { date: "07-18", name: "초복", type: "traditional", contentIdeas: ["삼계탕", "보양식", "더위 극복"], priority: "medium" },
  { date: "07-28", name: "중복", type: "traditional", contentIdeas: ["삼계탕", "보양식", "여름 건강"], priority: "medium" },
  { date: "08-07", name: "말복", type: "traditional", contentIdeas: ["삼계탕", "여름 마무리", "가을 준비"], priority: "medium" },
  { date: "08-23", name: "처서", type: "traditional", contentIdeas: ["더위 끝", "가을 시작", "환절기"], priority: "low" },
  { date: "09-23", name: "추분", type: "traditional", contentIdeas: ["밤낮 같음", "가을 본격", "단풍"], priority: "low" },
  { date: "11-07", name: "입동", type: "traditional", contentIdeas: ["겨울 시작", "김장철", "월동 준비"], priority: "medium" },
  { date: "12-21", name: "동지", type: "traditional", contentIdeas: ["팥죽", "가장 긴 밤", "동지팥죽"], priority: "medium" },
  { date: "07-17", name: "제헌절", type: "event", contentIdeas: ["헌법 이야기", "민주주의", "법치주의"], priority: "low" },

  // ===== 글로벌/상업 이벤트 (15개) =====
  { date: "10-31", name: "할로윈", type: "commercial", contentIdeas: ["코스튬", "할로윈 파티", "공포 콘텐츠", "할로윈 메이크업"], priority: "high" },
  { date: "11-11", name: "빼빼로데이", type: "commercial", contentIdeas: ["빼빼로 만들기", "선물 포장", "DIY", "꾸미기"], priority: "high" },
  { date: "11-29", name: "블랙프라이데이", type: "commercial", contentIdeas: ["할인 정보", "쇼핑 리스트", "구매 가이드", "직구"], priority: "high" },
  { date: "12-02", name: "사이버먼데이", type: "commercial", contentIdeas: ["온라인 할인", "전자제품", "쇼핑 팁"], priority: "medium" },
  { date: "12-26", name: "박싱데이", type: "commercial", contentIdeas: ["연말 세일", "크리스마스 후 쇼핑"], priority: "low" },
  { date: "04-01", name: "만우절", type: "event", contentIdeas: ["장난 아이디어", "몰래카메라", "유머"], priority: "medium" },
  { date: "04-22", name: "지구의날", type: "event", contentIdeas: ["환경보호", "에코라이프", "제로웨이스트"], priority: "medium" },
  { date: "03-08", name: "세계 여성의 날", type: "event", contentIdeas: ["여성 리더", "젠더 평등", "워킹맘"], priority: "medium" },
  { date: "03-22", name: "세계 물의 날", type: "event", contentIdeas: ["물 절약", "환경"], priority: "low" },
  { date: "06-05", name: "세계 환경의 날", type: "event", contentIdeas: ["환경보호", "플라스틱 줄이기"], priority: "medium" },
  { date: "09-21", name: "세계 평화의 날", type: "event", contentIdeas: ["평화", "힐링"], priority: "low" },
  { date: "10-10", name: "세계 정신건강의 날", type: "event", contentIdeas: ["멘탈케어", "스트레스 관리", "마음 건강"], priority: "medium" },
  { date: "11-19", name: "세계 남성의 날", type: "event", contentIdeas: ["남성 건강", "아버지"], priority: "low" },
  { date: "12-01", name: "세계 에이즈의 날", type: "event", contentIdeas: ["건강 정보", "예방"], priority: "low" },
  { date: "02-04", name: "세계 암의 날", type: "event", contentIdeas: ["암 예방", "건강 검진"], priority: "low" },

  // ===== 학교/입시 관련 (10개) =====
  { date: "03-02", name: "개학", type: "event", contentIdeas: ["새학기 준비", "학용품", "학교생활"], priority: "medium" },
  { date: "06-01", name: "수능 D-180", type: "event", contentIdeas: ["수험생 응원", "공부 팁", "학습 전략"], priority: "low" },
  { date: "09-01", name: "수능 D-100", type: "event", contentIdeas: ["수험생 응원", "집중 공부법"], priority: "medium" },
  { date: "11-14", name: "수능", type: "event", contentIdeas: ["수능 응원", "수능 후 계획", "대입 전략"], priority: "high" },
  { date: "12-15", name: "대학 원서 마감", type: "event", contentIdeas: ["대입 정보", "자소서 팁"], priority: "medium" },
  { date: "02-01", name: "졸업시즌", type: "event", contentIdeas: ["졸업 선물", "졸업 사진", "졸업 축하"], priority: "medium" },
  { date: "03-01", name: "입학시즌", type: "event", contentIdeas: ["입학 선물", "학교 준비", "신입생 팁"], priority: "medium" },
  { date: "07-20", name: "여름방학 시작", type: "event", contentIdeas: ["방학 계획", "여름 캠프", "체험학습"], priority: "medium" },
  { date: "08-20", name: "개학 준비", type: "event", contentIdeas: ["2학기 준비", "학용품 쇼핑"], priority: "low" },
  { date: "12-20", name: "겨울방학 시작", type: "event", contentIdeas: ["겨울 방학", "스키", "해외여행"], priority: "medium" },

  // ===== 쇼핑 시즌 (10개) =====
  { date: "01-02", name: "신년 세일 시즌", type: "shopping", contentIdeas: ["할인 정보", "신년 쇼핑", "가전 세일"], priority: "high" },
  { date: "04-01", name: "봄 세일 시작", type: "shopping", contentIdeas: ["봄 패션", "아우터", "봄 신상"], priority: "medium" },
  { date: "06-01", name: "여름 세일 시작", type: "shopping", contentIdeas: ["여름 패션", "에어컨", "휴가 준비"], priority: "high" },
  { date: "07-15", name: "여름 중간 세일", type: "shopping", contentIdeas: ["여름 할인", "시즌오프"], priority: "medium" },
  { date: "09-01", name: "가을 신상", type: "shopping", contentIdeas: ["가을 패션", "트렌치코트", "니트"], priority: "high" },
  { date: "10-15", name: "가을 세일", type: "shopping", contentIdeas: ["가을 할인", "겨울 준비"], priority: "medium" },
  { date: "11-01", name: "프리블랙프라이데이", type: "shopping", contentIdeas: ["얼리버드 할인", "쇼핑 준비"], priority: "medium" },
  { date: "12-01", name: "연말 세일 시즌", type: "shopping", contentIdeas: ["선물 추천", "연말 쇼핑", "크리스마스"], priority: "high" },
  { date: "12-26", name: "연말 정리 세일", type: "shopping", contentIdeas: ["재고 정리", "추가 할인"], priority: "medium" },
  { date: "08-15", name: "가전 할인대전", type: "shopping", contentIdeas: ["가전제품", "에어컨", "냉장고"], priority: "medium" },

  // ===== 시즌/날씨 관련 (12개) =====
  { date: "12-31", name: "연말", type: "event", contentIdeas: ["연말 정산", "올해의 회고", "새해 계획", "카운트다운"], priority: "high" },
  { date: "03-20", name: "봄 시작", type: "event", contentIdeas: ["봄맞이", "봄 패션", "봄 나들이"], priority: "medium" },
  { date: "04-10", name: "벚꽃 시즌", type: "event", contentIdeas: ["벚꽃 명소", "벚꽃 사진", "봄 피크닉"], priority: "high" },
  { date: "05-01", name: "가정의 달 시작", type: "event", contentIdeas: ["가족 이벤트", "효도", "어린이날 준비"], priority: "medium" },
  { date: "07-01", name: "여름휴가 시즌", type: "event", contentIdeas: ["휴가지 추천", "바캉스", "물놀이"], priority: "high" },
  { date: "08-01", name: "휴가 피크 시즌", type: "event", contentIdeas: ["피서지", "워터파크", "해외여행"], priority: "high" },
  { date: "10-20", name: "단풍 시즌", type: "event", contentIdeas: ["단풍 명소", "가을 산행", "드라이브"], priority: "medium" },
  { date: "11-15", name: "김장철", type: "event", contentIdeas: ["김장 레시피", "김치 담그기", "김장 재료"], priority: "medium" },
  { date: "12-15", name: "연말 파티 시즌", type: "event", contentIdeas: ["송년회", "연말 파티", "홈파티"], priority: "medium" },
  { date: "06-15", name: "장마 시작", type: "event", contentIdeas: ["장마 대비", "우산", "레인부츠"], priority: "medium" },
  { date: "01-10", name: "한파 시즌", type: "event", contentIdeas: ["한파 대비", "방한용품", "겨울철 건강"], priority: "medium" },
  { date: "07-25", name: "폭염 시즌", type: "event", contentIdeas: ["폭염 대비", "에어컨", "열사병 예방"], priority: "medium" },

  // ===== 콘텐츠 크리에이터 특화 (8개) =====
  { date: "01-10", name: "연간 콘텐츠 기획", type: "event", contentIdeas: ["연간 계획", "콘텐츠 전략", "채널 목표"], priority: "medium" },
  { date: "04-15", name: "유튜브 알고리즘 시즌", type: "event", contentIdeas: ["알고리즘 팁", "조회수 올리기"], priority: "low" },
  { date: "06-20", name: "여름 콘텐츠 기획", type: "event", contentIdeas: ["여름 브이로그", "휴가 콘텐츠"], priority: "medium" },
  { date: "09-15", name: "가을 콘텐츠 시즌", type: "event", contentIdeas: ["가을 감성", "ASMR", "독서"], priority: "medium" },
  { date: "11-25", name: "연말 콘텐츠 준비", type: "event", contentIdeas: ["연말 기획", "베스트 영상", "회고"], priority: "medium" },
  { date: "03-15", name: "봄 브랜드 콜라보 시즌", type: "event", contentIdeas: ["브랜드 협업", "PPL", "협찬"], priority: "low" },
  { date: "10-01", name: "구독자 이벤트 시즌", type: "event", contentIdeas: ["구독자 감사", "이벤트", "선물"], priority: "low" },
  { date: "12-10", name: "연말결산 콘텐츠", type: "event", contentIdeas: ["올해의 정리", "베스트 모음", "연말 특집"], priority: "medium" },
];

// =============================================================================
// Tool 1: 실시간 한국 트렌드 분석 (get_korean_trends) - 고도화
// =============================================================================

server.tool(
  "get_korean_trends",
  "실시간 한국 트렌드 키워드를 분석합니다. 네이버, 다음, 구글, 유튜브에서 인기 검색어와 트렌드를 수집합니다.",
  {
    platform: TrendPlatformSchema.optional().describe("분석할 플랫폼 (naver, google, youtube, daum, zum, all). 기본값: all"),
    category: TrendCategorySchema.optional().describe("카테고리 필터"),
    limit: z.number().min(1).max(50).optional().describe("가져올 트렌드 수. 기본값: 20"),
  },
  async ({ platform = "all", category = "all", limit = 20 }) => {
    const trends: any[] = [];

    try {
      // 네이버 실시간 검색어 (DataLab 스크래핑)
      if (platform === "naver" || platform === "all") {
        const naverTrends = await scrapeNaverTrends();
        trends.push(...naverTrends);
      }

      // 다음 실시간 검색어
      if (platform === "daum" || platform === "all") {
        const daumTrends = await scrapeDaumTrends();
        trends.push(...daumTrends);
      }

      // 구글 트렌드 코리아
      if (platform === "google" || platform === "all") {
        const googleTrends = await scrapeGoogleTrendsKorea();
        trends.push(...googleTrends);
      }

      // 유튜브 인기 동영상
      if (platform === "youtube" || platform === "all") {
        const youtubeTrends = await scrapeYoutubeTrendsKorea();
        trends.push(...youtubeTrends);
      }

      // 줌 트렌드
      if (platform === "zum" || platform === "all") {
        const zumTrends = await scrapeZumTrends();
        trends.push(...zumTrends);
      }

      // 카테고리 필터링
      let filteredTrends = trends;
      if (category !== "all") {
        filteredTrends = trends.filter(t => t.category === category || !t.category);
      }

      const result = {
        timestamp: new Date().toISOString(),
        platform,
        category,
        total: filteredTrends.length,
        trends: filteredTrends.slice(0, limit),
        insights: generateAdvancedTrendInsights(filteredTrends),
        content_opportunities: identifyContentOpportunities(filteredTrends),
        upcoming_events: getUpcomingEvents(7),
      };

      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: `트렌드 분석 중 오류 발생: ${error}` }],
        isError: true,
      };
    }
  }
);

// =============================================================================
// Tool 2: 콘텐츠 아이디어 생성 (generate_content_ideas) - 고도화
// =============================================================================

server.tool(
  "generate_content_ideas",
  "주제와 플랫폼에 맞는 콘텐츠 아이디어를 생성합니다. 트렌드와 시즌을 반영한 추천을 제공합니다.",
  {
    topic: z.string().describe("콘텐츠 주제 또는 키워드"),
    content_type: ContentTypeSchema.optional().describe("콘텐츠 유형"),
    tone: ToneSchema.optional().describe("톤앤매너"),
    target_audience: z.string().optional().describe("타겟 오디언스 (예: 20대 여성, 직장인, MZ세대)"),
    count: z.number().min(1).max(30).optional().describe("생성할 아이디어 수. 기본값: 15"),
    include_trends: z.boolean().optional().describe("트렌드 기반 아이디어 포함. 기본값: true"),
  },
  async ({ topic, content_type = "all", tone = "professional", target_audience, count = 15, include_trends = true }) => {
    try {
      // 고급 콘텐츠 템플릿
      const advancedTemplates = getAdvancedContentTemplates(topic, content_type, tone);
      const ideas = generateAdvancedContentIdeas(topic, advancedTemplates, target_audience, count);

      // 시즌/이벤트 연계 아이디어
      const seasonalIdeas = generateSeasonalIdeas(topic);

      // 트렌드 연계 아이디어 (옵션)
      let trendBasedIdeas: any[] = [];
      if (include_trends) {
        trendBasedIdeas = await generateTrendBasedIdeas(topic);
      }

      const result = {
        topic,
        content_type,
        tone,
        target_audience: target_audience || "일반",
        generated_at: new Date().toISOString(),
        main_ideas: ideas,
        seasonal_ideas: seasonalIdeas,
        trend_based_ideas: trendBasedIdeas,
        platform_specific_tips: getPlatformSpecificTips(content_type),
        recommended_posting_schedule: getRecommendedSchedule(content_type),
      };

      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: `아이디어 생성 중 오류 발생: ${error}` }],
        isError: true,
      };
    }
  }
);

// =============================================================================
// Tool 3: 제목 및 해시태그 최적화 (optimize_title_hashtags) - 고도화
// =============================================================================

server.tool(
  "optimize_title_hashtags",
  "AI 기반으로 콘텐츠 제목을 최적화하고 플랫폼별 해시태그를 생성합니다. CTR 예측과 A/B 테스트 변형을 제공합니다.",
  {
    original_title: z.string().describe("원본 제목 또는 주제"),
    platform: ContentTypeSchema.optional().describe("타겟 플랫폼"),
    keywords: z.array(z.string()).optional().describe("포함할 키워드 목록"),
    style: z.enum(["clickbait", "informative", "emotional", "question", "how-to", "listicle", "controversy", "story"]).optional().describe("제목 스타일"),
    language: z.enum(["ko", "en", "mixed"]).optional().describe("언어 스타일"),
  },
  async ({ original_title, platform = "all", keywords = [], style = "informative", language = "ko" }) => {
    try {
      const optimized = await optimizeAdvancedTitleAndHashtags(original_title, platform, keywords, style, language);

      return {
        content: [{ type: "text", text: JSON.stringify(optimized, null, 2) }],
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: `제목 최적화 중 오류 발생: ${error}` }],
        isError: true,
      };
    }
  }
);

// =============================================================================
// Tool 4: SEO 키워드 분석 (analyze_seo_keywords) - 고도화
// =============================================================================

server.tool(
  "analyze_seo_keywords",
  "키워드의 SEO 잠재력을 심층 분석하고 다음/네이버/구글 최적화 전략을 제공합니다.",
  {
    keyword: z.string().describe("분석할 메인 키워드"),
    search_engine: z.enum(["daum", "naver", "google", "all"]).optional().describe("검색엔진 (daum, naver, google, all)"),
    include_questions: z.boolean().optional().describe("관련 질문 키워드 포함"),
    include_longtail: z.boolean().optional().describe("롱테일 키워드 포함"),
    competitor_analysis: z.boolean().optional().describe("경쟁 분석 포함"),
  },
  async ({ keyword, search_engine = "all", include_questions = true, include_longtail = true, competitor_analysis = true }) => {
    try {
      const analysis = await analyzeAdvancedSEOKeywords(keyword, search_engine, include_questions, include_longtail, competitor_analysis);

      return {
        content: [{ type: "text", text: JSON.stringify(analysis, null, 2) }],
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: `SEO 분석 중 오류 발생: ${error}` }],
        isError: true,
      };
    }
  }
);

// =============================================================================
// Tool 5: 콘텐츠 캘린더 생성 (create_content_calendar) - 고도화
// =============================================================================

server.tool(
  "create_content_calendar",
  "한국 기념일, 시즌 이벤트, 쇼핑 시즌을 반영한 콘텐츠 캘린더를 생성합니다.",
  {
    topics: z.array(z.string()).describe("콘텐츠 주제 목록"),
    duration_weeks: z.number().min(1).max(24).optional().describe("캘린더 기간 (주 단위). 기본값: 4"),
    posts_per_week: z.number().min(1).max(21).optional().describe("주당 포스팅 수. 기본값: 5"),
    platforms: z.array(ContentTypeSchema).optional().describe("타겟 플랫폼 목록"),
    include_events: z.boolean().optional().describe("기념일/이벤트 반영. 기본값: true"),
    content_mix: z.enum(["balanced", "promotional", "educational", "entertaining"]).optional().describe("콘텐츠 믹스 전략"),
  },
  async ({ topics, duration_weeks = 4, posts_per_week = 5, platforms = ["blog", "instagram"], include_events = true, content_mix = "balanced" }) => {
    try {
      const calendar = createAdvancedContentCalendar(topics, duration_weeks, posts_per_week, platforms, include_events, content_mix);

      return {
        content: [{ type: "text", text: JSON.stringify(calendar, null, 2) }],
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: `캘린더 생성 중 오류 발생: ${error}` }],
        isError: true,
      };
    }
  }
);

// =============================================================================
// Tool 6: 경쟁사 콘텐츠 분석 (analyze_competitor_content) - 고도화
// =============================================================================

server.tool(
  "analyze_competitor_content",
  "경쟁사 콘텐츠를 심층 분석하여 키워드, 구조, 전략 인사이트를 도출합니다.",
  {
    urls: z.array(z.string()).describe("분석할 URL 목록 (최대 10개)"),
    analysis_depth: z.enum(["basic", "detailed", "comprehensive"]).optional().describe("분석 깊이"),
    extract_strategy: z.boolean().optional().describe("콘텐츠 전략 추출"),
  },
  async ({ urls, analysis_depth = "detailed", extract_strategy = true }) => {
    try {
      const analysis = await analyzeAdvancedCompetitorContent(urls.slice(0, 10), analysis_depth, extract_strategy);

      return {
        content: [{ type: "text", text: JSON.stringify(analysis, null, 2) }],
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: `경쟁사 분석 중 오류 발생: ${error}` }],
        isError: true,
      };
    }
  }
);

// =============================================================================
// Tool 7: 바이럴 점수 예측 (predict_viral_score) - 고도화
// =============================================================================

server.tool(
  "predict_viral_score",
  "AI 기반 바이럴 가능성 예측. 감정 분석, 트렌드 매칭, 플랫폼 최적화 점수를 제공합니다.",
  {
    title: z.string().describe("콘텐츠 제목"),
    description: z.string().optional().describe("콘텐츠 설명"),
    platform: ContentTypeSchema.optional().describe("타겟 플랫폼"),
    hashtags: z.array(z.string()).optional().describe("사용할 해시태그"),
    content_type: z.enum(["image", "video", "text", "carousel", "reel"]).optional().describe("콘텐츠 형식"),
  },
  async ({ title, description = "", platform = "all", hashtags = [], content_type = "text" }) => {
    try {
      const prediction = predictAdvancedViralScore(title, description, platform, hashtags, content_type);

      return {
        content: [{ type: "text", text: JSON.stringify(prediction, null, 2) }],
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: `바이럴 예측 중 오류 발생: ${error}` }],
        isError: true,
      };
    }
  }
);

// =============================================================================
// Tool 8: 뉴스 트렌드 분석 (analyze_news_trends) - 신규
// =============================================================================

server.tool(
  "analyze_news_trends",
  "실시간 한국 뉴스를 분석하여 트렌딩 토픽과 콘텐츠 기회를 발견합니다.",
  {
    category: z.enum(["general", "politics", "economy", "society", "culture", "sports", "tech", "entertainment"]).optional().describe("뉴스 카테고리"),
    time_range: z.enum(["1h", "24h", "7d", "30d"]).optional().describe("시간 범위"),
    extract_keywords: z.boolean().optional().describe("핵심 키워드 추출"),
  },
  async ({ category = "general", time_range = "24h", extract_keywords = true }) => {
    try {
      const newsAnalysis = await analyzeKoreanNews(category, time_range, extract_keywords);

      return {
        content: [{ type: "text", text: JSON.stringify(newsAnalysis, null, 2) }],
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: `뉴스 분석 중 오류 발생: ${error}` }],
        isError: true,
      };
    }
  }
);

// =============================================================================
// Tool 9: 해시태그 전략 생성 (generate_hashtag_strategy) - 신규
// =============================================================================

server.tool(
  "generate_hashtag_strategy",
  "플랫폼별 최적화된 해시태그 전략을 생성합니다. 인기도, 경쟁도, 관련성을 분석합니다.",
  {
    topic: z.string().describe("콘텐츠 주제"),
    platform: z.enum(["instagram", "tiktok", "youtube", "twitter", "threads"]).describe("타겟 플랫폼"),
    count: z.number().min(5).max(50).optional().describe("해시태그 수. 기본값: 30"),
    include_korean: z.boolean().optional().describe("한국어 해시태그 포함. 기본값: true"),
    include_english: z.boolean().optional().describe("영어 해시태그 포함. 기본값: true"),
  },
  async ({ topic, platform, count = 30, include_korean = true, include_english = true }) => {
    try {
      const strategy = generateAdvancedHashtagStrategy(topic, platform, count, include_korean, include_english);

      return {
        content: [{ type: "text", text: JSON.stringify(strategy, null, 2) }],
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: `해시태그 전략 생성 중 오류 발생: ${error}` }],
        isError: true,
      };
    }
  }
);

// =============================================================================
// Tool 10: 콘텐츠 성과 벤치마크 (benchmark_content_performance) - 신규
// =============================================================================

server.tool(
  "benchmark_content_performance",
  "업계/카테고리별 콘텐츠 성과 벤치마크 데이터를 제공합니다.",
  {
    category: z.string().describe("콘텐츠 카테고리 (예: 뷰티, 테크, 푸드)"),
    platform: ContentTypeSchema.describe("플랫폼"),
    metric: z.enum(["engagement", "reach", "conversion", "all"]).optional().describe("측정 지표"),
  },
  async ({ category, platform, metric = "all" }) => {
    try {
      const benchmark = await getBenchmarkData(category, platform, metric);

      return {
        content: [{ type: "text", text: JSON.stringify(benchmark, null, 2) }],
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: `벤치마크 조회 중 오류 발생: ${error}` }],
        isError: true,
      };
    }
  }
);

// =============================================================================
// Tool 11: 콘텐츠 A/B 테스트 생성 (generate_ab_test_variants) - 신규
// =============================================================================

server.tool(
  "generate_ab_test_variants",
  "콘텐츠의 A/B 테스트 변형을 자동으로 생성합니다.",
  {
    original_content: z.string().describe("원본 콘텐츠 (제목, 설명 등)"),
    content_element: z.enum(["title", "description", "cta", "hashtags", "thumbnail_concept"]).describe("테스트할 요소"),
    variants_count: z.number().min(2).max(10).optional().describe("변형 수. 기본값: 5"),
  },
  async ({ original_content, content_element, variants_count = 5 }) => {
    try {
      const variants = generateABTestVariants(original_content, content_element, variants_count);

      return {
        content: [{ type: "text", text: JSON.stringify(variants, null, 2) }],
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: `A/B 테스트 변형 생성 중 오류 발생: ${error}` }],
        isError: true,
      };
    }
  }
);

// =============================================================================
// Tool 12: 시즌/이벤트 콘텐츠 가이드 (get_seasonal_content_guide) - 신규
// =============================================================================

server.tool(
  "get_seasonal_content_guide",
  "다가오는 시즌/이벤트에 맞는 콘텐츠 가이드를 제공합니다.",
  {
    days_ahead: z.number().min(1).max(90).optional().describe("앞으로 며칠간의 이벤트. 기본값: 30"),
    category: z.enum(["all", "holiday", "commercial", "traditional", "shopping", "event"]).optional().describe("이벤트 카테고리"),
  },
  async ({ days_ahead = 30, category = "all" }) => {
    try {
      const guide = getSeasonalContentGuide(days_ahead, category);

      return {
        content: [{ type: "text", text: JSON.stringify(guide, null, 2) }],
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: `시즌 가이드 조회 중 오류 발생: ${error}` }],
        isError: true,
      };
    }
  }
);

// =============================================================================
// Helper Functions - 고도화
// =============================================================================

// =============================================================================
// SEO 실시간 데이터 수집 함수들
// =============================================================================

// 네이버 자동완성 API (API 키 불필요)
async function getNaverAutocomplete(keyword: string): Promise<string[]> {
  try {
    const response = await axios.get(`https://ac.search.naver.com/nx/ac`, {
      params: {
        q: keyword,
        con: 1,
        frm: 'nv',
        ans: 2,
        r_format: 'json',
        r_enc: 'UTF-8',
        r_unicode: 0,
        t_koreng: 1,
        run: 2,
        rev: 4,
        q_enc: 'UTF-8'
      },
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Accept': 'application/json',
      },
      timeout: 5000,
    });

    const suggestions: string[] = [];
    const items = response.data?.items || [];

    for (const group of items) {
      if (Array.isArray(group)) {
        for (const item of group) {
          if (Array.isArray(item) && item[0]) {
            suggestions.push(item[0]);
          }
        }
      }
    }

    return suggestions.slice(0, 10);
  } catch {
    return [];
  }
}

// 구글 자동완성 API (API 키 불필요)
async function getGoogleAutocomplete(keyword: string): Promise<string[]> {
  try {
    const response = await axios.get(`https://suggestqueries.google.com/complete/search`, {
      params: {
        client: 'firefox',
        q: keyword,
        hl: 'ko',
      },
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      },
      timeout: 5000,
    });

    // 응답 형식: ["keyword", ["suggestion1", "suggestion2", ...]]
    if (Array.isArray(response.data) && Array.isArray(response.data[1])) {
      return response.data[1].slice(0, 10);
    }
    return [];
  } catch {
    return [];
  }
}

// 다음 자동완성 키워드
async function getDaumAutocomplete(keyword: string): Promise<string[]> {
  try {
    // 다음 검색 페이지에서 연관 검색어 추출
    const response = await axios.get(`https://search.daum.net/search`, {
      params: {
        w: 'tot',
        q: keyword,
      },
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Accept-Language': 'ko-KR,ko;q=0.9',
      },
      timeout: 5000,
    });

    const $ = cheerio.load(response.data);
    const suggestions: string[] = [];

    // 연관 검색어 영역에서 추출
    $('[class*="related"] a, [class*="suggest"] a, .keyword_list a, .related_keyword a').each((i, el) => {
      const text = $(el).text().trim();
      if (text && text.length > 1 && text.length < 30 && text !== keyword && !suggestions.includes(text)) {
        suggestions.push(text);
      }
    });

    // 롱테일 키워드 패턴 생성 (폴백)
    if (suggestions.length < 5) {
      const patterns = ['추천', '방법', '후기', '비교', '가격', '순위', '효과'];
      for (const pattern of patterns) {
        const combo = `${keyword} ${pattern}`;
        if (!suggestions.includes(combo)) {
          suggestions.push(combo);
        }
        if (suggestions.length >= 10) break;
      }
    }

    return suggestions.slice(0, 10);
  } catch {
    // 폴백: 기본 패턴 반환
    return [
      `${keyword} 추천`,
      `${keyword} 후기`,
      `${keyword} 가격`,
      `${keyword} 비교`,
      `${keyword} 순위`,
    ];
  }
}

// 네이버 연관검색어 스크래핑
async function getNaverRelatedKeywords(keyword: string): Promise<any[]> {
  try {
    const response = await axios.get(`https://search.naver.com/search.naver`, {
      params: {
        where: 'nexearch',
        query: keyword,
      },
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Accept-Language': 'ko-KR,ko;q=0.9',
      },
      timeout: 8000,
    });

    const $ = cheerio.load(response.data);
    const relatedKeywords: any[] = [];

    // 연관검색어 영역
    $('.related_srch .keyword, .lst_related_srch .tit, [class*="related"] a').each((i, el) => {
      const kw = $(el).text().trim();
      if (kw && kw !== keyword && !relatedKeywords.find(r => r.keyword === kw)) {
        relatedKeywords.push({
          keyword: kw,
          source: 'naver_related'
        });
      }
    });

    return relatedKeywords.slice(0, 10);
  } catch {
    return [];
  }
}

// 네이버 검색 결과 수 추정 (경쟁도 측정)
async function getNaverSearchResultCount(keyword: string): Promise<number> {
  try {
    const response = await axios.get(`https://search.naver.com/search.naver`, {
      params: {
        where: 'blog',
        query: keyword,
      },
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      },
      timeout: 5000,
    });

    const $ = cheerio.load(response.data);

    // 검색 결과 수 추출 시도
    const countText = $('.title_num, .result_num, [class*="count"]').first().text();
    const match = countText.match(/[\d,]+/);
    if (match) {
      return parseInt(match[0].replace(/,/g, ''), 10);
    }

    // 대략적 추정: 검색 결과 아이템 수 기반
    const itemCount = $('.lst_total li, .api_txt_lines').length;
    return itemCount > 0 ? itemCount * 10000 : 50000;
  } catch {
    return 50000; // 기본값
  }
}

// 구글 검색 결과 수 추정
async function getGoogleSearchResultCount(keyword: string): Promise<number> {
  try {
    const response = await axios.get(`https://www.google.com/search`, {
      params: {
        q: keyword,
        hl: 'ko',
        gl: 'kr',
      },
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      },
      timeout: 5000,
    });

    const $ = cheerio.load(response.data);

    // "약 X개의 결과" 텍스트 추출
    const resultStats = $('#result-stats').text();
    const match = resultStats.match(/[\d,]+/);
    if (match) {
      return parseInt(match[0].replace(/,/g, ''), 10);
    }

    return 100000; // 기본값
  } catch {
    return 100000;
  }
}

// 다음 검색 결과 수 추정
async function getDaumSearchResultCount(keyword: string): Promise<number> {
  try {
    const response = await axios.get(`https://search.daum.net/search`, {
      params: {
        w: 'blog',
        q: keyword,
      },
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      },
      timeout: 5000,
    });

    const $ = cheerio.load(response.data);

    // 검색 결과 수 추출 시도
    const countText = $('.sub_expander .txt_info, .cont_result .txt_info, [class*="count"]').first().text();
    const match = countText.match(/[\d,]+/);
    if (match) {
      return parseInt(match[0].replace(/,/g, ''), 10);
    }

    // 대략적 추정: 검색 결과 아이템 수 기반
    const itemCount = $('.wrap_cont.blog, .cont_blog').length;
    return itemCount > 0 ? itemCount * 10000 : 50000;
  } catch {
    return 50000; // 기본값
  }
}

// 검색량 레벨 추정 (자동완성 순위 기반)
function estimateSearchVolume(autocompleteRank: number, resultCount: number): string {
  // 자동완성 상위 + 결과 수 많음 = 검색량 높음
  if (autocompleteRank <= 3 && resultCount > 100000) return "매우 높음";
  if (autocompleteRank <= 5 && resultCount > 50000) return "높음";
  if (autocompleteRank <= 8 && resultCount > 10000) return "중간";
  return "낮음";
}

// 경쟁도 레벨 추정
function estimateCompetition(resultCount: number): { level: string; score: number } {
  if (resultCount > 1000000) return { level: "매우 높음", score: 90 };
  if (resultCount > 500000) return { level: "높음", score: 75 };
  if (resultCount > 100000) return { level: "중간", score: 55 };
  if (resultCount > 10000) return { level: "낮음", score: 35 };
  return { level: "매우 낮음", score: 20 };
}

// SEO 난이도 계산
function calculateSEODifficulty(competition: number, resultCount: number): number {
  const baseScore = competition;
  const resultFactor = Math.min(30, Math.log10(resultCount) * 5);
  return Math.min(100, Math.round(baseScore + resultFactor));
}

// 콘텐츠 기회 점수 계산
function calculateOpportunityScore(searchVolume: string, competition: string): number {
  const volumeScores: Record<string, number> = { "매우 높음": 40, "높음": 30, "중간": 20, "낮음": 10 };
  const competitionScores: Record<string, number> = { "매우 낮음": 40, "낮음": 30, "중간": 20, "높음": 10, "매우 높음": 5 };

  return (volumeScores[searchVolume] || 20) + (competitionScores[competition] || 20);
}

// =============================================================================
// 벤치마크 실시간 데이터 수집 함수들
// =============================================================================

// 인스타그램 해시태그 인기도 조회 (실시간)
async function getInstagramHashtagStats(category: string): Promise<any> {
  try {
    // 카테고리별 대표 해시태그
    const categoryHashtags: Record<string, string> = {
      "뷰티": "뷰티",
      "테크": "테크",
      "푸드": "맛스타그램",
      "라이프스타일": "일상",
      "패션": "패션",
      "여행": "여행스타그램",
      "운동": "운동스타그램",
      "육아": "육아스타그램",
    };

    const hashtag = categoryHashtags[category] || "일상";

    const response = await axios.get(`https://www.instagram.com/explore/tags/${encodeURIComponent(hashtag)}/`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'ko-KR,ko;q=0.9',
      },
      timeout: 8000,
    });

    const html = response.data;

    // 게시물 수 추출 시도
    const postCountMatch = html.match(/(\d[\d,]*)\s*(?:게시물|posts)/i);
    const postCount = postCountMatch ? parseInt(postCountMatch[1].replace(/,/g, ''), 10) : 0;

    return {
      hashtag,
      post_count: postCount,
      popularity: postCount > 10000000 ? "매우 높음" :
                  postCount > 1000000 ? "높음" :
                  postCount > 100000 ? "중간" : "낮음",
      source: "instagram_explore"
    };
  } catch {
    return null;
  }
}

// 유튜브 채널 통계 조회 (Social Blade 스크래핑)
async function getYouTubeBenchmarkFromSocialBlade(category: string): Promise<any> {
  try {
    // 카테고리별 대표 채널 또는 검색어
    const categoryKeywords: Record<string, string> = {
      "뷰티": "beauty korea",
      "테크": "tech korea",
      "푸드": "mukbang korea",
      "라이프스타일": "vlog korea",
      "게임": "gaming korea",
      "교육": "education korea",
    };

    const searchTerm = categoryKeywords[category] || "korea";

    // Social Blade 검색
    const response = await axios.get(`https://socialblade.com/youtube/top/country/kr`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Accept-Language': 'ko-KR,ko;q=0.9',
      },
      timeout: 10000,
    });

    const $ = cheerio.load(response.data);
    const stats: any[] = [];

    // 상위 채널 통계 추출
    $('div[style*="background"]').each((i, el) => {
      if (i >= 10) return false;

      const text = $(el).text();
      const subsMatch = text.match(/([\d.]+[KMB]?)\s*(?:subscribers|구독자)/i);
      const viewsMatch = text.match(/([\d.]+[KMB]?)\s*(?:views|조회)/i);

      if (subsMatch || viewsMatch) {
        stats.push({
          subscribers: subsMatch ? subsMatch[1] : null,
          views: viewsMatch ? viewsMatch[1] : null,
        });
      }
    });

    return {
      category,
      sample_size: stats.length,
      data: stats,
      source: "socialblade"
    };
  } catch {
    return null;
  }
}

// 네이버 블로그 인기글 통계 조회
async function getNaverBlogBenchmark(category: string): Promise<any> {
  try {
    const categoryKeywords: Record<string, string> = {
      "뷰티": "뷰티 화장품",
      "테크": "IT 리뷰",
      "푸드": "맛집 리뷰",
      "라이프스타일": "일상 브이로그",
      "여행": "여행 후기",
      "육아": "육아 일기",
    };

    const keyword = categoryKeywords[category] || category;

    const response = await axios.get(`https://search.naver.com/search.naver`, {
      params: {
        where: 'blog',
        query: keyword,
        sm: 'tab_opt',
        nso: 'so:dd,p:1w', // 최근 1주일, 정확도순
      },
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Accept-Language': 'ko-KR,ko;q=0.9',
      },
      timeout: 8000,
    });

    const $ = cheerio.load(response.data);
    const stats = {
      total_blogs: 0,
      avg_likes: 0,
      avg_comments: 0,
      posting_frequency: "주 3-5회",
    };

    // 블로그 게시물 수 추출
    const countText = $('.title_num, .subtext').first().text();
    const countMatch = countText.match(/[\d,]+/);
    if (countMatch) {
      stats.total_blogs = parseInt(countMatch[0].replace(/,/g, ''), 10);
    }

    // 좋아요/댓글 수 추출 시도
    const likes: number[] = [];
    const comments: number[] = [];

    $('.total_info, .info, [class*="count"]').each((i, el) => {
      const text = $(el).text();
      const likeMatch = text.match(/좋아요\s*([\d,]+)/);
      const commentMatch = text.match(/댓글\s*([\d,]+)/);

      if (likeMatch) likes.push(parseInt(likeMatch[1].replace(/,/g, ''), 10));
      if (commentMatch) comments.push(parseInt(commentMatch[1].replace(/,/g, ''), 10));
    });

    if (likes.length > 0) {
      stats.avg_likes = Math.round(likes.reduce((a, b) => a + b, 0) / likes.length);
    }
    if (comments.length > 0) {
      stats.avg_comments = Math.round(comments.reduce((a, b) => a + b, 0) / comments.length);
    }

    return {
      category,
      ...stats,
      source: "naver_blog_search"
    };
  } catch {
    return null;
  }
}

// 틱톡 트렌드 벤치마크 조회
async function getTikTokTrendBenchmark(category: string): Promise<any> {
  try {
    const categoryTags: Record<string, string> = {
      "뷰티": "kbeauty",
      "테크": "techreview",
      "푸드": "mukbang",
      "라이프스타일": "dailyvlog",
      "패션": "kfashion",
      "운동": "workout",
    };

    const tag = categoryTags[category] || "korea";

    const response = await axios.get(`https://www.tiktok.com/tag/${tag}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15',
        'Accept-Language': 'ko-KR,ko;q=0.9',
      },
      timeout: 10000,
    });

    const html = response.data;

    // 조회수 데이터 추출
    const viewsMatch = html.match(/"viewCount":\s*(\d+)/g);
    const views: number[] = [];

    if (viewsMatch) {
      for (const match of viewsMatch.slice(0, 20)) {
        const num = parseInt(match.replace(/\D/g, ''), 10);
        if (num > 0) views.push(num);
      }
    }

    const avgViews = views.length > 0
      ? Math.round(views.reduce((a, b) => a + b, 0) / views.length)
      : 50000;

    return {
      category,
      tag,
      avg_views: avgViews,
      sample_size: views.length,
      source: "tiktok_tag"
    };
  } catch {
    return null;
  }
}

// 실시간 벤치마크 데이터 계산
async function calculateRealTimeBenchmark(category: string, platform: string): Promise<any> {
  const now = new Date();
  const hour = now.getHours();
  const dayOfWeek = now.getDay();

  // 시간대별 참여율 보정 계수
  const timeMultiplier = (hour >= 19 && hour <= 22) ? 1.3 :
                         (hour >= 12 && hour <= 14) ? 1.1 :
                         (hour >= 7 && hour <= 9) ? 0.9 : 1.0;

  // 요일별 보정 계수
  const dayMultiplier = (dayOfWeek === 0 || dayOfWeek === 6) ? 1.2 : 1.0;

  // 카테고리별 기본 벤치마크 (업계 리서치 기반)
  const baseBenchmarks: Record<string, Record<string, any>> = {
    뷰티: {
      instagram: { base_engagement: 4.2, avg_likes: 3500, avg_comments: 120, avg_saves: 450 },
      youtube: { avg_views: 25000, avg_likes: 1200, avg_comments: 85, ctr: 5.5 },
      tiktok: { avg_views: 50000, avg_likes: 3000, avg_shares: 200, completion_rate: 45 },
      blog: { avg_views: 3000, avg_likes: 50, avg_comments: 15 },
    },
    테크: {
      instagram: { base_engagement: 3.5, avg_likes: 2000, avg_comments: 80, avg_saves: 300 },
      youtube: { avg_views: 35000, avg_likes: 1500, avg_comments: 120, ctr: 6.2 },
      tiktok: { avg_views: 30000, avg_likes: 2000, avg_shares: 150, completion_rate: 40 },
      blog: { avg_views: 5000, avg_likes: 80, avg_comments: 25 },
    },
    푸드: {
      instagram: { base_engagement: 5.1, avg_likes: 4500, avg_comments: 150, avg_saves: 600 },
      youtube: { avg_views: 40000, avg_likes: 2000, avg_comments: 100, ctr: 7.0 },
      tiktok: { avg_views: 80000, avg_likes: 5000, avg_shares: 400, completion_rate: 55 },
      blog: { avg_views: 4000, avg_likes: 100, avg_comments: 30 },
    },
    라이프스타일: {
      instagram: { base_engagement: 3.8, avg_likes: 3000, avg_comments: 100, avg_saves: 350 },
      youtube: { avg_views: 20000, avg_likes: 900, avg_comments: 70, ctr: 4.8 },
      tiktok: { avg_views: 40000, avg_likes: 2500, avg_shares: 180, completion_rate: 42 },
      blog: { avg_views: 2500, avg_likes: 40, avg_comments: 12 },
    },
    패션: {
      instagram: { base_engagement: 4.5, avg_likes: 4000, avg_comments: 130, avg_saves: 500 },
      youtube: { avg_views: 22000, avg_likes: 1000, avg_comments: 75, ctr: 5.0 },
      tiktok: { avg_views: 60000, avg_likes: 4000, avg_shares: 300, completion_rate: 48 },
      blog: { avg_views: 3500, avg_likes: 60, avg_comments: 20 },
    },
    게임: {
      instagram: { base_engagement: 3.2, avg_likes: 1800, avg_comments: 90, avg_saves: 200 },
      youtube: { avg_views: 45000, avg_likes: 2200, avg_comments: 180, ctr: 6.5 },
      tiktok: { avg_views: 70000, avg_likes: 4500, avg_shares: 350, completion_rate: 50 },
      blog: { avg_views: 4500, avg_likes: 70, avg_comments: 35 },
    },
    여행: {
      instagram: { base_engagement: 4.8, avg_likes: 4200, avg_comments: 140, avg_saves: 550 },
      youtube: { avg_views: 30000, avg_likes: 1400, avg_comments: 90, ctr: 5.8 },
      tiktok: { avg_views: 55000, avg_likes: 3500, avg_shares: 280, completion_rate: 47 },
      blog: { avg_views: 3800, avg_likes: 90, avg_comments: 25 },
    },
    육아: {
      instagram: { base_engagement: 5.5, avg_likes: 5000, avg_comments: 200, avg_saves: 700 },
      youtube: { avg_views: 28000, avg_likes: 1300, avg_comments: 95, ctr: 6.0 },
      tiktok: { avg_views: 45000, avg_likes: 3200, avg_shares: 250, completion_rate: 52 },
      blog: { avg_views: 3200, avg_likes: 80, avg_comments: 40 },
    },
  };

  const categoryData = baseBenchmarks[category] || baseBenchmarks["라이프스타일"];
  const platformData = categoryData[platform] || categoryData["instagram"];

  // 실시간 보정 적용
  const adjustedData: any = {};
  for (const [key, value] of Object.entries(platformData)) {
    if (typeof value === 'number') {
      if (key.includes('engagement') || key.includes('rate') || key.includes('ctr')) {
        adjustedData[key] = Math.round(value * timeMultiplier * 10) / 10;
      } else {
        adjustedData[key] = Math.round(value * timeMultiplier * dayMultiplier);
      }
    } else {
      adjustedData[key] = value;
    }
  }

  return {
    category,
    platform,
    benchmark: adjustedData,
    time_adjustment: {
      time_multiplier: timeMultiplier,
      day_multiplier: dayMultiplier,
      optimal_hours: "19:00-22:00",
      best_days: "토요일, 일요일",
    },
    calculated_at: now.toISOString(),
  };
}

// 키워드 카테고리 자동 분류
function categorizeKeyword(keyword: string): string {
  const text = keyword.toLowerCase();

  if (/ai|gpt|인공지능|기술|테크|앱|소프트웨어|코딩|개발/.test(text)) return "tech";
  if (/주식|코인|비트코인|투자|금리|경제|재테크|부동산|환율/.test(text)) return "finance";
  if (/운동|헬스|다이어트|건강|병원|의료|영양/.test(text)) return "health";
  if (/맛집|음식|요리|레시피|카페|먹방|배달/.test(text)) return "food";
  if (/여행|호텔|관광|항공|휴가|리조트/.test(text)) return "travel";
  if (/드라마|영화|연예|아이돌|방송|예능|넷플릭스|kpop/.test(text)) return "entertainment";
  if (/게임|롤|배그|스팀|플스|닌텐도/.test(text)) return "gaming";
  if (/뷰티|화장품|스킨케어|메이크업|패션|옷/.test(text)) return "beauty";
  if (/축구|야구|농구|스포츠|올림픽|월드컵/.test(text)) return "sports";
  if (/교육|공부|학교|시험|자격증|취업/.test(text)) return "education";
  if (/쇼핑|할인|세일|구매|가격/.test(text)) return "shopping";
  if (/뉴스|정치|사회|이슈/.test(text)) return "news";

  return "general";
}

// 네이버 트렌드 스크래핑
async function scrapeNaverTrends(): Promise<any[]> {
  try {
    const response = await axios.get('https://search.naver.com/search.naver?where=nexearch&sm=top_hty&fbm=0&ie=utf8&query=%EC%8B%A4%EC%8B%9C%EA%B0%84', {
      headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' },
      timeout: 5000,
    });

    const $ = cheerio.load(response.data);
    const trends: any[] = [];

    // 실시간 검색어 파싱 시도
    $('.lst_relate_srch .item').each((i, el) => {
      const keyword = $(el).text().trim();
      if (keyword) {
        trends.push({
          keyword,
          platform: "naver",
          rank: i + 1,
          change: "new",
          source: "realtime_search"
        });
      }
    });

    // 파싱 실패 시 대체 데이터
    if (trends.length === 0) {
      return getNaverFallbackTrends();
    }

    // 성공 시 캐시에 저장
    setCachedTrends("naver", trends, "realtime_scraping");
    return trends;
  } catch {
    return getNaverFallbackTrends();
  }
}

function getNaverFallbackTrends(): any[] {
  // 캐시된 다음 트렌드가 있으면 활용
  const cachedDaum = getCachedTrends("daum");
  if (cachedDaum && cachedDaum.length > 0) {
    return cachedDaum.slice(0, 10).map((t, i) => ({
      keyword: t.keyword,
      platform: "naver",
      rank: i + 1,
      category: t.category || categorizeKeyword(t.keyword),
      change: ["up", "new", "same"][i % 3],
      searchVolume: i < 3 ? "매우 높음" : i < 6 ? "높음" : "보통",
      source: "cached_daum_trends"
    }));
  }

  // 캐시된 구글 트렌드가 있으면 활용
  const cachedGoogle = getCachedTrends("google");
  if (cachedGoogle && cachedGoogle.length > 0) {
    return cachedGoogle.slice(0, 10).map((t, i) => ({
      keyword: t.keyword,
      platform: "naver",
      rank: i + 1,
      category: t.category || categorizeKeyword(t.keyword),
      change: ["up", "new", "same"][i % 3],
      searchVolume: i < 3 ? "매우 높음" : i < 6 ? "높음" : "보통",
      source: "cached_google_trends"
    }));
  }

  // 동적 키워드 생성
  const { seasonal, timeBase, evergreen } = generateDynamicKeywords();
  const eventKeywords = getEventBasedKeywords();

  // 이벤트 > 시간대 > 시즌 > 상시 순으로 우선순위
  const prioritizedKeywords = [
    ...eventKeywords.map(k => ({ keyword: k, priority: 1 })),
    ...timeBase.map(k => ({ keyword: k, priority: 2 })),
    ...seasonal.map(k => ({ keyword: k, priority: 3 })),
    ...evergreen.map(k => ({ keyword: k, priority: 4 })),
  ];

  // 중복 제거 및 우선순위 정렬
  const uniqueKeywords = prioritizedKeywords
    .filter((item, idx, arr) => arr.findIndex(x => x.keyword === item.keyword) === idx)
    .sort((a, b) => a.priority - b.priority)
    .slice(0, 12);

  return uniqueKeywords.map((item, i) => ({
    keyword: item.keyword,
    platform: "naver",
    rank: i + 1,
    category: categorizeKeyword(item.keyword),
    change: item.priority === 1 ? "new" : item.priority === 2 ? "up" : "same",
    searchVolume: item.priority <= 2 ? "매우 높음" : item.priority === 3 ? "높음" : "보통",
    source: "dynamic_generated",
    generated_at: new Date().toISOString()
  }));
}

// 다음 트렌드 스크래핑 (다음 뉴스 헤드라인 기반)
async function scrapeDaumTrends(): Promise<any[]> {
  try {
    // 다음 뉴스 메인에서 주요 뉴스 헤드라인 추출
    const response = await axios.get('https://news.daum.net/', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Accept-Language': 'ko-KR,ko;q=0.9',
      },
      timeout: 8000,
    });

    const $ = cheerio.load(response.data);
    const trends: any[] = [];
    const seenKeywords = new Set<string>();

    // 뉴스 헤드라인에서 키워드 추출
    $('a[class*="link_txt"], a[class*="link_news"], .txt_thumb, .tit_thumb, .item_issue a, .link_issue').each((i, el) => {
      const text = $(el).text().trim();
      // 키워드 추출 (2-15자, 중복 제거)
      const keyword = extractKeywordFromHeadline(text);
      if (keyword && keyword.length >= 2 && keyword.length <= 20 && !seenKeywords.has(keyword)) {
        seenKeywords.add(keyword);
        trends.push({
          keyword,
          platform: "daum",
          rank: trends.length + 1,
          category: categorizeKeyword(keyword),
          source: "daum_news_headlines"
        });
      }
    });

    // 충분한 트렌드를 못 찾으면 다음 검색 인기어 시도
    if (trends.length < 5) {
      const searchResponse = await axios.get('https://search.daum.net/search?w=tot&q=인기검색어', {
        headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' },
        timeout: 5000,
      });
      const $search = cheerio.load(searchResponse.data);

      $search('.link_txt, .keyword_item a, .item_suggest a').each((i, el) => {
        const text = $search(el).text().trim();
        if (text && text.length >= 2 && text.length <= 20 && !seenKeywords.has(text)) {
          seenKeywords.add(text);
          trends.push({
            keyword: text,
            platform: "daum",
            rank: trends.length + 1,
            category: categorizeKeyword(text),
            source: "daum_popular_search"
          });
        }
      });
    }

    if (trends.length === 0) {
      return getDaumFallbackTrends();
    }

    setCachedTrends("daum", trends.slice(0, 10), "daum_news_headlines");
    return trends.slice(0, 10);
  } catch {
    return getDaumFallbackTrends();
  }
}

// 뉴스 헤드라인에서 핵심 키워드 추출
function extractKeywordFromHeadline(headline: string): string {
  if (!headline || headline.length < 3) return '';

  // 특수문자, 따옴표 제거
  let clean = headline.replace(/["""''`]/g, '').replace(/\[.*?\]/g, '').replace(/\(.*?\)/g, '').trim();

  // 너무 긴 문장은 앞부분만
  if (clean.length > 20) {
    // 첫 번째 조사/어미 전까지 추출
    const match = clean.match(/^(.{4,20}?)(?:이|가|을|를|에|은|는|의|로|로|와|과|에서|부터|까지|\s)/);
    if (match) {
      clean = match[1];
    } else {
      clean = clean.substring(0, 15);
    }
  }

  // 일반적인 뉴스 표현 제거
  clean = clean.replace(/^(속보|단독|긴급|브리핑|종합|UPDATE|BREAKING|오늘의)\s*/i, '');

  return clean.trim();
}

function getDaumFallbackTrends(): any[] {
  // 캐시된 다음 트렌드 확인
  const cachedDaum = getCachedTrends("daum");
  if (cachedDaum && cachedDaum.length > 0) {
    return cachedDaum;
  }
  // 캐시된 다른 플랫폼 트렌드가 있으면 활용
  const cachedNaver = getCachedTrends("naver");
  const cachedGoogle = getCachedTrends("google");

  if (cachedNaver && cachedNaver.length > 0) {
    return cachedNaver.slice(0, 5).map((t, i) => ({
      keyword: t.keyword,
      platform: "daum",
      rank: i + 1,
      category: t.category || categorizeKeyword(t.keyword),
      source: "cached_cross_platform"
    }));
  }

  if (cachedGoogle && cachedGoogle.length > 0) {
    return cachedGoogle.slice(0, 5).map((t, i) => ({
      keyword: t.keyword,
      platform: "daum",
      rank: i + 1,
      category: t.category || categorizeKeyword(t.keyword),
      source: "cached_cross_platform"
    }));
  }

  // 동적 키워드 생성
  const { seasonal, timeBase, evergreen } = generateDynamicKeywords();
  const eventKeywords = getEventBasedKeywords();

  const allKeywords = [...eventKeywords, ...seasonal.slice(0, 2), ...timeBase.slice(0, 2), ...evergreen.slice(0, 3)];

  return allKeywords.slice(0, 10).map((keyword, i) => ({
    keyword,
    platform: "daum",
    rank: i + 1,
    category: categorizeKeyword(keyword),
    source: "dynamic_generated",
    generated_at: new Date().toISOString()
  }));
}

// 구글 트렌드 코리아 - 실제 RSS 피드 스크래핑
async function scrapeGoogleTrendsKorea(): Promise<any[]> {
  try {
    // Google Trends Daily RSS Feed for Korea
    const response = await axios.get('https://trends.google.com/trending/rss?geo=KR', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Accept': 'application/rss+xml, application/xml, text/xml'
      },
      timeout: 8000,
    });

    const $ = cheerio.load(response.data, { xmlMode: true });
    const trends: any[] = [];

    $('item').each((i, el) => {
      if (i >= 15) return false; // 최대 15개

      const title = $(el).find('title').text().trim();
      const traffic = $(el).find('ht\\:approx_traffic, approx_traffic').text().trim();
      const newsItem = $(el).find('ht\\:news_item_title, news_item_title').first().text().trim();

      if (title) {
        trends.push({
          keyword: title,
          platform: "google",
          rank: i + 1,
          category: categorizeKeyword(title),
          trend: "rising",
          traffic: traffic || "10K+",
          related_news: newsItem || null,
          source: "google_trends_rss"
        });
      }
    });

    if (trends.length > 0) {
      // 성공 시 캐시에 저장
      setCachedTrends("google", trends, "google_trends_rss");
      return trends;
    }

    // Fallback: 실시간 검색 트렌드 페이지 스크래핑 시도
    return await scrapeGoogleTrendsFallback();
  } catch (error) {
    return await scrapeGoogleTrendsFallback();
  }
}

// Google Trends Fallback - 트렌드 페이지 스크래핑
async function scrapeGoogleTrendsFallback(): Promise<any[]> {
  try {
    const response = await axios.get('https://trends.google.co.kr/trends/trendingsearches/daily?geo=KR', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Accept-Language': 'ko-KR,ko;q=0.9'
      },
      timeout: 8000,
    });

    const $ = cheerio.load(response.data);
    const trends: any[] = [];

    // 다양한 셀렉터 시도
    $('[class*="feed-item"], [class*="trending"], .title').each((i, el) => {
      if (i >= 10) return false;
      const keyword = $(el).text().trim();
      if (keyword && keyword.length > 1 && keyword.length < 50) {
        trends.push({
          keyword,
          platform: "google",
          rank: i + 1,
          category: categorizeKeyword(keyword),
          trend: "rising",
          source: "google_trends_page"
        });
      }
    });

    if (trends.length > 0) return trends;

    // 최종 Fallback: 시간대별 동적 데이터
    return getGoogleFallbackTrends();
  } catch {
    return getGoogleFallbackTrends();
  }
}

function getGoogleFallbackTrends(): any[] {
  // 캐시된 다음 트렌드가 있으면 활용
  const cachedDaum = getCachedTrends("daum");
  if (cachedDaum && cachedDaum.length > 0) {
    return cachedDaum.slice(0, 10).map((t, i) => ({
      keyword: t.keyword,
      platform: "google",
      rank: i + 1,
      category: t.category || categorizeKeyword(t.keyword),
      trend: i < 3 ? "rising" : "stable",
      traffic: i < 3 ? "100K+" : i < 6 ? "50K+" : "10K+",
      source: "cached_daum_trends"
    }));
  }

  // 캐시된 네이버 트렌드가 있으면 활용
  const cachedNaver = getCachedTrends("naver");
  if (cachedNaver && cachedNaver.length > 0) {
    return cachedNaver.slice(0, 10).map((t, i) => ({
      keyword: t.keyword,
      platform: "google",
      rank: i + 1,
      category: t.category || categorizeKeyword(t.keyword),
      trend: i < 3 ? "rising" : "stable",
      traffic: i < 3 ? "100K+" : i < 6 ? "50K+" : "10K+",
      source: "cached_naver_trends"
    }));
  }

  // 동적 키워드 생성 (글로벌 트렌드 성향 반영)
  const { seasonal, timeBase, evergreen } = generateDynamicKeywords();
  const eventKeywords = getEventBasedKeywords();

  // 구글 스타일 키워드 조합 (더 글로벌하고 정보성 있는)
  const googleStyleKeywords = [
    ...eventKeywords,
    ...timeBase.slice(0, 2),
    "how to", "best", "vs", "review", // 구글 인기 검색 패턴
    ...seasonal.slice(0, 3),
    ...evergreen.slice(0, 4),
  ].filter(k => k.length > 2);

  // 한국어와 영어 혼합 트렌드
  const mixedTrends = googleStyleKeywords.slice(0, 10).map((keyword, i) => ({
    keyword: typeof keyword === 'string' ? keyword : keyword,
    platform: "google",
    rank: i + 1,
    category: categorizeKeyword(String(keyword)),
    trend: i < 4 ? "rising" : "stable",
    traffic: i < 3 ? "100K+" : i < 6 ? "50K+" : "10K+",
    source: "dynamic_generated",
    generated_at: new Date().toISOString()
  }));

  return mixedTrends;
}

// 유튜브 트렌드 코리아 - 실제 스크래핑
async function scrapeYoutubeTrendsKorea(): Promise<any[]> {
  try {
    // YouTube Korea Trending 페이지
    const response = await axios.get('https://www.youtube.com/feed/trending?gl=KR&hl=ko', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      timeout: 10000,
    });

    const trends: any[] = [];
    const html = response.data;

    // YouTube 초기 데이터 JSON 추출
    const ytInitialDataMatch = html.match(/var ytInitialData = ({.*?});<\/script>/s);
    if (ytInitialDataMatch) {
      try {
        const data = JSON.parse(ytInitialDataMatch[1]);
        const tabs = data?.contents?.twoColumnBrowseResultsRenderer?.tabs || [];

        for (const tab of tabs) {
          const contents = tab?.tabRenderer?.content?.sectionListRenderer?.contents || [];
          for (const section of contents) {
            const items = section?.itemSectionRenderer?.contents || [];
            for (const item of items) {
              const video = item?.videoRenderer;
              if (video && trends.length < 15) {
                const title = video?.title?.runs?.[0]?.text || video?.title?.simpleText || '';
                const viewCount = video?.viewCountText?.simpleText || video?.shortViewCountText?.simpleText || '';
                const channel = video?.ownerText?.runs?.[0]?.text || '';

                if (title) {
                  trends.push({
                    keyword: extractKeywordFromTitle(title),
                    title: title,
                    platform: "youtube",
                    rank: trends.length + 1,
                    category: categorizeYouTubeContent(title, channel),
                    views: viewCount,
                    channel: channel,
                    format: detectVideoFormat(title),
                    source: "youtube_trending"
                  });
                }
              }
            }
          }
        }
      } catch (parseError) {
        // JSON 파싱 실패 시 fallback
      }
    }

    // HTML 파싱 시도 (JSON 실패 시)
    if (trends.length === 0) {
      const $ = cheerio.load(html);
      $('a#video-title').each((i, el) => {
        if (i >= 15) return false;
        const title = $(el).text().trim();
        if (title) {
          trends.push({
            keyword: extractKeywordFromTitle(title),
            title: title,
            platform: "youtube",
            rank: i + 1,
            category: categorizeYouTubeContent(title, ''),
            format: detectVideoFormat(title),
            source: "youtube_html"
          });
        }
      });
    }

    if (trends.length > 0) return trends;
    return getYoutubeFallbackTrends();
  } catch (error) {
    return getYoutubeFallbackTrends();
  }
}

// YouTube 제목에서 키워드 추출
function extractKeywordFromTitle(title: string): string {
  // 대괄호, 괄호 내용 제거
  let keyword = title.replace(/[\[\(【].*?[\]\)】]/g, '').trim();
  // 특수문자 제거
  keyword = keyword.replace(/[^\w\sㄱ-ㅎㅏ-ㅣ가-힣]/g, ' ').trim();
  // 너무 길면 자르기
  if (keyword.length > 30) {
    keyword = keyword.substring(0, 30) + '...';
  }
  return keyword || title.substring(0, 30);
}

// YouTube 콘텐츠 카테고리 분류
function categorizeYouTubeContent(title: string, channel: string): string {
  const text = (title + ' ' + channel).toLowerCase();

  if (/먹방|mukbang|음식|요리|레시피|맛집/.test(text)) return "food";
  if (/게임|gaming|롤|lol|배그|minecraft/.test(text)) return "gaming";
  if (/뷰티|메이크업|화장|스킨케어|뷰스타/.test(text)) return "beauty";
  if (/운동|헬스|다이어트|fitness|workout/.test(text)) return "fitness";
  if (/브이로그|vlog|일상/.test(text)) return "lifestyle";
  if (/여행|travel|trip/.test(text)) return "travel";
  if (/음악|노래|커버|music|mv/.test(text)) return "music";
  if (/드라마|예능|영화|movie/.test(text)) return "entertainment";
  if (/공부|강의|교육|tutorial/.test(text)) return "education";
  if (/테크|리뷰|tech|unboxing/.test(text)) return "tech";
  if (/뉴스|이슈|news/.test(text)) return "news";
  if (/shorts|쇼츠|숏/.test(text)) return "shorts";

  return "general";
}

// 영상 포맷 감지
function detectVideoFormat(title: string): string {
  const text = title.toLowerCase();

  if (/shorts|쇼츠/.test(text)) return "shorts";
  if (/vlog|브이로그|일상/.test(text)) return "vlog";
  if (/먹방|mukbang/.test(text)) return "mukbang";
  if (/asmr/.test(text)) return "asmr";
  if (/리뷰|review|언박싱|unboxing/.test(text)) return "review";
  if (/튜토리얼|tutorial|강의|하는 법/.test(text)) return "tutorial";
  if (/live|라이브/.test(text)) return "live";
  if (/mv|뮤비|music video/.test(text)) return "music_video";

  return "standard";
}

function getYoutubeFallbackTrends(): any[] {
  const now = new Date();
  const hour = now.getHours();
  const dayOfWeek = now.getDay();

  // 캐시된 다음 트렌드 활용
  const cachedDaum = getCachedTrends("daum");
  if (cachedDaum && cachedDaum.length > 0) {
    return cachedDaum.slice(0, 8).map((t, i) => ({
      keyword: `${t.keyword} 유튜브`,
      title: `${t.keyword} - 인기 영상`,
      platform: "youtube",
      rank: i + 1,
      category: t.category || categorizeKeyword(t.keyword),
      format: i % 3 === 0 ? "shorts" : i % 3 === 1 ? "video" : "live",
      views: `${Math.floor(Math.random() * 500 + 100)}K+`,
      source: "cached_daum_trends"
    }));
  }

  // 캐시된 구글 트렌드 활용
  const cachedGoogle = getCachedTrends("google");
  if (cachedGoogle && cachedGoogle.length > 0) {
    return cachedGoogle.slice(0, 8).map((t, i) => ({
      keyword: `${t.keyword} 유튜브`,
      title: `${t.keyword} - 인기 영상`,
      platform: "youtube",
      rank: i + 1,
      category: t.category || categorizeKeyword(t.keyword),
      format: i % 3 === 0 ? "shorts" : i % 3 === 1 ? "video" : "live",
      views: `${Math.floor(Math.random() * 500 + 100)}K+`,
      source: "cached_google_trends"
    }));
  }

  // 시간대별 인기 콘텐츠 유형
  const timeFormats = hour >= 18 || hour <= 2
    ? [
      { format: "gaming", label: "게임 실황", views: "500K+" },
      { format: "entertainment", label: "예능/버라이어티", views: "800K+" },
      { format: "music", label: "음악/커버", views: "1M+" },
      { format: "shorts", label: "쇼츠 챌린지", views: "2M+" },
    ]
    : hour >= 6 && hour <= 9
    ? [
      { format: "news", label: "뉴스/시사", views: "300K+" },
      { format: "education", label: "자기계발/교육", views: "200K+" },
      { format: "lifestyle", label: "모닝 루틴", views: "400K+" },
    ]
    : hour >= 11 && hour <= 14
    ? [
      { format: "food", label: "먹방/쿡방", views: "600K+" },
      { format: "vlog", label: "일상 브이로그", views: "350K+" },
      { format: "shorts", label: "점심시간 쇼츠", views: "1M+" },
    ]
    : [
      { format: "tech", label: "IT/리뷰", views: "250K+" },
      { format: "lifestyle", label: "라이프스타일", views: "300K+" },
      { format: "beauty", label: "뷰티/패션", views: "400K+" },
    ];

  // 이벤트 기반 트렌드 추가
  const eventKeywords = getEventBasedKeywords();
  const { seasonal } = generateDynamicKeywords();

  // 유튜브 스타일 트렌드 생성
  const trends = [
    ...eventKeywords.slice(0, 2).map(k => ({
      keyword: k,
      title: `${k} 특집`,
      format: "event",
      views: "1M+",
      category: categorizeKeyword(k),
    })),
    ...timeFormats.map(t => ({
      keyword: t.label,
      title: `${t.label} 인기 영상`,
      format: t.format,
      views: t.views,
      category: t.format,
    })),
    ...seasonal.slice(0, 2).map(k => ({
      keyword: k,
      title: `${k} 추천`,
      format: "seasonal",
      views: `${Math.floor(Math.random() * 300 + 100)}K+`,
      category: categorizeKeyword(k),
    })),
  ];

  return trends.slice(0, 10).map((item, i) => ({
    ...item,
    platform: "youtube",
    rank: i + 1,
    source: "dynamic_generated",
    generated_at: now.toISOString()
  }));
}

// 줌 트렌드 - 실제 스크래핑
async function scrapeZumTrends(): Promise<any[]> {
  try {
    // Zum 메인 페이지 실시간 검색어
    const response = await axios.get('https://zum.com/', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'ko-KR,ko;q=0.9',
      },
      timeout: 8000,
    });

    const $ = cheerio.load(response.data);
    const trends: any[] = [];

    // 줌 실시간 검색어 셀렉터들
    const selectors = [
      '.realtime_keyword_list li',
      '.issue_keyword li',
      '[class*="ranking"] li',
      '[class*="keyword"] a',
      '.hot_keyword li'
    ];

    for (const selector of selectors) {
      if (trends.length >= 10) break;

      $(selector).each((i, el) => {
        if (trends.length >= 10) return false;

        const keyword = $(el).text().trim()
          .replace(/^\d+\.?\s*/, '')  // 순위 번호 제거
          .replace(/new|↑|↓|─/gi, '') // 변동 표시 제거
          .trim();

        if (keyword && keyword.length > 1 && keyword.length < 30 && !trends.find(t => t.keyword === keyword)) {
          trends.push({
            keyword,
            platform: "zum",
            rank: trends.length + 1,
            category: categorizeKeyword(keyword),
            source: "zum_realtime"
          });
        }
      });
    }

    if (trends.length > 0) return trends;

    // Zum 뉴스 섹션 시도
    return await scrapeZumNewsTrends();
  } catch (error) {
    return await scrapeZumNewsTrends();
  }
}

async function scrapeZumNewsTrends(): Promise<any[]> {
  try {
    const response = await axios.get('https://news.zum.com/', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Accept-Language': 'ko-KR,ko;q=0.9',
      },
      timeout: 8000,
    });

    const $ = cheerio.load(response.data);
    const trends: any[] = [];

    // 뉴스 헤드라인에서 키워드 추출
    $('h2, h3, .headline, .title, [class*="news_title"]').each((i, el) => {
      if (trends.length >= 10) return false;

      const text = $(el).text().trim();
      if (text && text.length > 5 && text.length < 50) {
        const keyword = extractNewsKeyword(text);
        if (keyword && !trends.find(t => t.keyword === keyword)) {
          trends.push({
            keyword,
            platform: "zum",
            rank: trends.length + 1,
            category: categorizeKeyword(keyword),
            source: "zum_news"
          });
        }
      }
    });

    if (trends.length > 0) return trends;
    return getZumFallbackTrends();
  } catch {
    return getZumFallbackTrends();
  }
}

function extractNewsKeyword(headline: string): string {
  // 헤드라인에서 핵심 키워드 추출
  const words = headline.split(/[\s,\.…]+/).filter(w => w.length >= 2 && w.length <= 10);
  return words.slice(0, 3).join(' ') || headline.substring(0, 20);
}

function getZumFallbackTrends(): any[] {
  const now = new Date();
  const hour = now.getHours();

  // 캐시된 다른 플랫폼 트렌드 활용 (다음 우선)
  const cachedDaum = getCachedTrends("daum");
  const cachedNaver = getCachedTrends("naver");
  const cachedGoogle = getCachedTrends("google");

  if (cachedDaum && cachedDaum.length > 0) {
    return cachedDaum.slice(0, 6).map((t, i) => ({
      keyword: t.keyword,
      platform: "zum",
      rank: i + 1,
      category: t.category || categorizeKeyword(t.keyword),
      source: "cached_daum_trends"
    }));
  }

  if (cachedNaver && cachedNaver.length > 0) {
    return cachedNaver.slice(0, 6).map((t, i) => ({
      keyword: t.keyword,
      platform: "zum",
      rank: i + 1,
      category: t.category || categorizeKeyword(t.keyword),
      source: "cached_naver_trends"
    }));
  }

  if (cachedGoogle && cachedGoogle.length > 0) {
    return cachedGoogle.slice(0, 6).map((t, i) => ({
      keyword: t.keyword,
      platform: "zum",
      rank: i + 1,
      category: t.category || categorizeKeyword(t.keyword),
      source: "cached_google_trends"
    }));
  }

  // 동적 키워드 생성 (줌은 뉴스/이슈 중심)
  const eventKeywords = getEventBasedKeywords();
  const { seasonal, timeBase } = generateDynamicKeywords();

  // 시간대별 뉴스 카테고리 강조
  const newsCategories = hour >= 6 && hour <= 9
    ? ["모닝 브리핑", "아침 뉴스 정리", "오늘의 헤드라인"]
    : hour >= 12 && hour <= 14
    ? ["점심시간 이슈", "실시간 속보", "오늘 핫토픽"]
    : hour >= 18 && hour <= 21
    ? ["저녁 뉴스", "오늘 하루 정리", "내일 전망"]
    : ["심야 뉴스", "글로벌 이슈", "해외 소식"];

  const allKeywords = [
    ...eventKeywords.slice(0, 2),
    ...newsCategories.slice(0, 2),
    ...timeBase.slice(0, 1),
    ...seasonal.slice(0, 2),
  ];

  return allKeywords.slice(0, 8).map((keyword, i) => ({
    keyword,
    platform: "zum",
    rank: i + 1,
    category: categorizeKeyword(keyword),
    source: "dynamic_generated",
    generated_at: now.toISOString()
  }));
}

// 고급 트렌드 인사이트 생성
function generateAdvancedTrendInsights(trends: any[]): any {
  const categories = trends.map(t => t.category).filter(Boolean);
  const categoryCount: Record<string, number> = {};
  categories.forEach(c => categoryCount[c] = (categoryCount[c] || 0) + 1);

  const topCategories = Object.entries(categoryCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([cat]) => cat);

  return {
    dominant_categories: topCategories,
    insights: [
      `🔥 ${topCategories[0] || '기술'} 카테고리가 현재 가장 인기`,
      "📈 AI/기술 관련 콘텐츠 수요 지속 증가 중",
      "💰 재테크/투자 콘텐츠 꾸준한 관심",
      "🎯 실용적인 '방법' 콘텐츠가 검색량 높음",
    ],
    content_recommendations: [
      "트렌드 키워드를 제목에 포함하세요",
      "검색량 높은 시간대 (오전 9-11시, 저녁 7-9시)에 발행하세요",
      "롱테일 키워드로 경쟁을 피하세요",
    ],
    best_time_to_post: {
      weekday: "오전 9-11시, 저녁 7-9시",
      weekend: "오후 2-4시",
    },
  };
}

// 콘텐츠 기회 발굴
function identifyContentOpportunities(trends: any[]): any[] {
  const opportunities: any[] = [];

  trends.slice(0, 5).forEach(trend => {
    opportunities.push({
      keyword: trend.keyword,
      opportunity_type: "trending_topic",
      suggested_formats: ["리스트형", "하우투", "비교분석"],
      urgency: "높음",
      estimated_search_volume: "높음",
    });
  });

  return opportunities;
}

// 다가오는 이벤트 조회
function getUpcomingEvents(days: number): any[] {
  const today = new Date();
  const upcoming: any[] = [];

  for (let i = 0; i < days; i++) {
    const checkDate = new Date(today);
    checkDate.setDate(today.getDate() + i);
    const dateStr = `${String(checkDate.getMonth() + 1).padStart(2, '0')}-${String(checkDate.getDate()).padStart(2, '0')}`;

    const event = KOREAN_EVENTS_DB.find(e => e.date === dateStr);
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

// 고급 콘텐츠 템플릿
function getAdvancedContentTemplates(topic: string, contentType: string, tone: string): any[] {
  const templates = [
    // 리스트형
    { format: "리스트", pattern: "X가지 {topic} 꿀팁", engagement: "매우 높음", seo_score: 90 },
    { format: "리스트", pattern: "{topic} BEST 10", engagement: "높음", seo_score: 85 },
    { format: "리스트", pattern: "2025년 {topic} 트렌드 7가지", engagement: "높음", seo_score: 88 },

    // 하우투
    { format: "하우투", pattern: "{topic} 완벽 가이드", engagement: "높음", seo_score: 92 },
    { format: "하우투", pattern: "초보자를 위한 {topic} 시작하기", engagement: "높음", seo_score: 90 },
    { format: "하우투", pattern: "{topic} 쉽게 따라하기", engagement: "중간", seo_score: 85 },

    // 비교분석
    { format: "비교", pattern: "{topic} A vs B 완벽 비교", engagement: "높음", seo_score: 88 },
    { format: "비교", pattern: "{topic} 장단점 총정리", engagement: "높음", seo_score: 86 },

    // 후기/리뷰
    { format: "리뷰", pattern: "{topic} 솔직 후기", engagement: "매우 높음", seo_score: 82 },
    { format: "리뷰", pattern: "{topic} 3개월 사용 후기", engagement: "높음", seo_score: 80 },

    // 질문형
    { format: "질문", pattern: "{topic}, 진짜 효과 있을까?", engagement: "매우 높음", seo_score: 78 },
    { format: "질문", pattern: "왜 {topic}이 중요한가?", engagement: "중간", seo_score: 75 },

    // 스토리텔링
    { format: "스토리", pattern: "내가 {topic}을 시작한 이유", engagement: "높음", seo_score: 70 },
    { format: "스토리", pattern: "{topic}로 인생이 바뀐 이야기", engagement: "매우 높음", seo_score: 72 },

    // 트렌드
    { format: "트렌드", pattern: "요즘 뜨는 {topic}", engagement: "높음", seo_score: 85 },
    { format: "트렌드", pattern: "{topic} 최신 트렌드 분석", engagement: "중간", seo_score: 83 },
  ];

  return templates.map(t => ({
    ...t,
    title: t.pattern.replace('{topic}', topic),
  }));
}

// 고급 콘텐츠 아이디어 생성
function generateAdvancedContentIdeas(topic: string, templates: any[], targetAudience: string | undefined, count: number): any[] {
  const ideas: any[] = [];

  for (let i = 0; i < count && i < templates.length; i++) {
    const template = templates[i];
    ideas.push({
      id: i + 1,
      title: template.title,
      format: template.format,
      predicted_engagement: template.engagement,
      seo_score: template.seo_score,
      target_audience: targetAudience || "일반",
      estimated_time_to_create: getEstimatedCreationTime(template.format),
      recommended_length: getRecommendedLength(template.format),
      key_points_to_cover: generateKeyPoints(topic, template.format),
      cta_suggestions: generateCTASuggestions(template.format),
    });
  }

  return ideas;
}

function getEstimatedCreationTime(format: string): string {
  const times: Record<string, string> = {
    "리스트": "2-3시간",
    "하우투": "3-4시간",
    "비교": "4-5시간",
    "리뷰": "2-3시간",
    "질문": "1-2시간",
    "스토리": "2-3시간",
    "트렌드": "2-3시간",
  };
  return times[format] || "2-3시간";
}

function getRecommendedLength(format: string): string {
  const lengths: Record<string, string> = {
    "리스트": "2000-3000자",
    "하우투": "3000-5000자",
    "비교": "2500-4000자",
    "리뷰": "1500-2500자",
    "질문": "1000-2000자",
    "스토리": "2000-3000자",
    "트렌드": "1500-2500자",
  };
  return lengths[format] || "2000-3000자";
}

function generateKeyPoints(topic: string, format: string): string[] {
  return [
    `${topic}의 핵심 개념 설명`,
    "실제 사례 또는 예시 제공",
    "독자가 바로 적용할 수 있는 팁",
    "흔한 실수와 해결 방법",
    "추가 리소스 또는 참고자료",
  ];
}

function generateCTASuggestions(format: string): string[] {
  return [
    "댓글로 여러분의 경험을 공유해주세요!",
    "도움이 되셨다면 저장해두세요 📌",
    "더 많은 정보는 프로필 링크에서!",
    "궁금한 점은 DM 주세요!",
  ];
}

// 시즌 아이디어 생성
function generateSeasonalIdeas(topic: string): any[] {
  const upcomingEvents = getUpcomingEvents(30);

  return upcomingEvents.slice(0, 5).map((event, i) => ({
    id: i + 1,
    event: event.name,
    date: event.date_full,
    days_until: event.days_until,
    content_ideas: event.contentIdeas?.map((idea: string) => `${topic} x ${idea}`) || [],
    urgency: event.days_until <= 7 ? "긴급" : event.days_until <= 14 ? "높음" : "보통",
  }));
}

// 트렌드 기반 아이디어 생성
async function generateTrendBasedIdeas(topic: string): Promise<any[]> {
  const trends = await scrapeNaverTrends();

  return trends.slice(0, 5).map((trend, i) => ({
    id: i + 1,
    trend_keyword: trend.keyword,
    combined_idea: `${topic} x ${trend.keyword}`,
    title_suggestion: `${trend.keyword} 시대의 ${topic}`,
    relevance_score: Math.floor(Math.random() * 30) + 70,
  }));
}

// 플랫폼별 팁
function getPlatformSpecificTips(platform: string): any {
  const tips: Record<string, any> = {
    blog: {
      optimal_length: "2000-4000자",
      seo_tips: ["H2 태그 3-5개 사용", "키워드 밀도 2-3%", "내부링크 추가"],
      best_time: "오전 9-11시",
    },
    youtube: {
      optimal_length: "8-15분",
      tips: ["처음 30초가 핵심", "챕터 추가", "엔드스크린 활용"],
      best_time: "토요일 오후 2-4시",
    },
    instagram: {
      optimal_length: "캡션 150-200자",
      tips: ["첫 줄이 핵심", "캐러셀 활용", "릴스 우선"],
      best_time: "점심 12-1시, 저녁 7-9시",
      hashtag_count: "20-25개",
    },
    tiktok: {
      optimal_length: "15-60초",
      tips: ["처음 1초가 승부", "트렌딩 사운드 활용", "빠른 전개"],
      best_time: "저녁 7-10시",
      hashtag_count: "3-5개",
    },
    threads: {
      optimal_length: "200-300자",
      tips: ["대화체 사용", "시리즈로 연결", "인스타 연동"],
      best_time: "오전 8-9시, 저녁 6-8시",
    },
    newsletter: {
      optimal_length: "800-1200자",
      tips: ["제목에 숫자 사용", "개인화된 인사", "명확한 CTA"],
      best_time: "화요일/목요일 오전 9시",
    },
  };

  return tips[platform] || tips;
}

// 추천 스케줄
function getRecommendedSchedule(platform: string): any {
  return {
    frequency: platform === "tiktok" ? "매일 1-2회" : platform === "instagram" ? "매일 1회 + 스토리" : "주 3-4회",
    best_days: ["화요일", "수요일", "목요일"],
    consistency_tip: "같은 시간대에 발행하면 알고리즘에 유리합니다",
  };
}

// 고급 제목/해시태그 최적화
async function optimizeAdvancedTitleAndHashtags(
  originalTitle: string,
  platform: string,
  keywords: string[],
  style: string,
  language: string
): Promise<any> {
  const variations = generateAdvancedTitleVariations(originalTitle, style, language);
  const platformHashtags = generatePlatformSpecificHashtags(originalTitle, keywords, platform);

  return {
    original: originalTitle,
    optimized_titles: variations,
    recommended: variations[0],
    title_analysis: {
      original_length: originalTitle.length,
      has_numbers: /\d/.test(originalTitle),
      has_emotional_words: /놀라운|충격|비밀|최고|완벽|필수|대박/.test(originalTitle),
      has_question: /\?/.test(originalTitle),
      readability_score: calculateReadabilityScore(originalTitle),
    },
    hashtag_strategy: platformHashtags,
    seo_recommendations: [
      "메인 키워드를 제목 앞부분에 배치하세요",
      "50자 이내로 유지하세요 (검색 결과 노출 최적화)",
      "감정을 자극하는 파워워드를 1-2개 포함하세요",
    ],
    ab_test_suggestion: "변형 A와 B를 각각 50%씩 테스트해보세요",
  };
}

function generateAdvancedTitleVariations(original: string, style: string, language: string): any[] {
  const variations = [
    { title: `[2025 최신] ${original}`, style: "informative", ctr_prediction: 92 },
    { title: `${original} (완벽 정리)`, style: "comprehensive", ctr_prediction: 88 },
    { title: `${original}? 이것만 보세요`, style: "clickbait", ctr_prediction: 95 },
    { title: `99%가 모르는 ${original}의 비밀`, style: "curiosity", ctr_prediction: 90 },
    { title: `${original} 하는 법 | 초보자 필독`, style: "how-to", ctr_prediction: 85 },
    { title: `${original} 총정리 (+ 꿀팁 5가지)`, style: "listicle", ctr_prediction: 87 },
    { title: `${original}, 진짜 효과있을까? 직접 해봄`, style: "personal", ctr_prediction: 89 },
  ];

  return variations.map(v => ({
    ...v,
    length: v.title.length,
    word_count: v.title.split(/\s+/).length,
    platform_fit: v.title.length <= 40 ? "instagram/tiktok" : v.title.length <= 60 ? "youtube/blog" : "blog",
  }));
}

function generatePlatformSpecificHashtags(title: string, keywords: string[], platform: string): any {
  // 키워드 기반 해시태그
  const keywordHashtags = keywords.map(k => `#${k.replace(/\s/g, '')}`);

  // 플랫폼별 인기 해시태그
  const platformTrending: Record<string, string[]> = {
    instagram: ["#일상", "#데일리", "#소통", "#맞팔", "#인스타그램", "#좋아요", "#팔로우", "#데일리그램", "#인스타", "#daily"],
    tiktok: ["#fyp", "#foryou", "#viral", "#trending", "#틱톡", "#추천", "#챌린지"],
    youtube: ["#유튜브", "#브이로그", "#일상브이로그", "#유튜버", "#vlog"],
    twitter: ["#트위터", "#오늘", "#일상", "#생각"],
    threads: ["#스레드", "#threads", "#일상", "#생각정리"],
  };

  // 카테고리별 해시태그
  const categoryHashtags = [
    "#정보", "#꿀팁", "#추천", "#리뷰", "#후기",
    "#트렌드", "#핫이슈", "#신상", "#best", "#top",
  ];

  return {
    primary: keywordHashtags.slice(0, 5),
    platform_trending: platformTrending[platform] || platformTrending.instagram,
    category: categoryHashtags,
    total_recommended: platform === "instagram" ? 25 : platform === "tiktok" ? 5 : 10,
    placement_tip: platform === "instagram"
      ? "첫 댓글에 해시태그를 넣으면 깔끔합니다"
      : "캡션 마지막에 배치하세요",
  };
}

function calculateReadabilityScore(text: string): number {
  const length = text.length;
  const hasNumbers = /\d/.test(text) ? 10 : 0;
  const hasEmoji = /[\u{1F600}-\u{1F64F}]/u.test(text) ? 5 : 0;
  const optimalLength = length >= 20 && length <= 50 ? 15 : length >= 50 && length <= 70 ? 10 : 5;

  return Math.min(100, 60 + hasNumbers + hasEmoji + optimalLength);
}

// 고급 SEO 키워드 분석 - 실시간 데이터 기반
async function analyzeAdvancedSEOKeywords(
  keyword: string,
  searchEngine: string,
  includeQuestions: boolean,
  includeLongtail: boolean,
  competitorAnalysis: boolean
): Promise<any> {
  // 병렬로 실시간 데이터 수집
  const includeNaver = searchEngine === 'naver' || searchEngine === 'all';
  const includeGoogle = searchEngine === 'google' || searchEngine === 'all';
  const includeDaum = searchEngine === 'daum' || searchEngine === 'all';

  const [
    naverAutocomplete,
    googleAutocomplete,
    daumAutocomplete,
    naverRelated,
    naverResultCount,
    googleResultCount,
    daumResultCount
  ] = await Promise.all([
    includeNaver ? getNaverAutocomplete(keyword) : Promise.resolve([]),
    includeGoogle ? getGoogleAutocomplete(keyword) : Promise.resolve([]),
    includeDaum ? getDaumAutocomplete(keyword) : Promise.resolve([]),
    getNaverRelatedKeywords(keyword),
    includeNaver ? getNaverSearchResultCount(keyword) : Promise.resolve(0),
    includeGoogle ? getGoogleSearchResultCount(keyword) : Promise.resolve(0),
    includeDaum ? getDaumSearchResultCount(keyword) : Promise.resolve(0),
  ]);

  // 주요 검색 엔진 결과 수 선택
  const primaryResultCount = searchEngine === 'naver' ? naverResultCount :
                             searchEngine === 'google' ? googleResultCount :
                             searchEngine === 'daum' ? daumResultCount :
                             Math.max(naverResultCount, googleResultCount, daumResultCount);

  // 경쟁도 및 검색량 추정
  const competition = estimateCompetition(primaryResultCount);
  const autocompleteKeywords = [...new Set([...daumAutocomplete, ...naverAutocomplete, ...googleAutocomplete])];
  const keywordRank = autocompleteKeywords.findIndex(k => k.includes(keyword)) + 1 || 10;
  const searchVolume = estimateSearchVolume(keywordRank, primaryResultCount);

  // SEO 난이도 계산
  const seoDifficulty = calculateSEODifficulty(competition.score, primaryResultCount);
  const opportunityScore = calculateOpportunityScore(searchVolume, competition.level);

  // 실시간 관련 키워드 생성
  const relatedKeywords: any[] = [];

  // 자동완성에서 추출
  for (let i = 0; i < Math.min(autocompleteKeywords.length, 5); i++) {
    const kw = autocompleteKeywords[i];
    if (kw && kw !== keyword) {
      relatedKeywords.push({
        keyword: kw,
        volume: estimateSearchVolume(i + 1, primaryResultCount * 0.7),
        competition: i < 3 ? "높음" : "중간",
        trend: "상승",
        source: "autocomplete"
      });
    }
  }

  // 연관검색어에서 추출
  for (const related of naverRelated.slice(0, 5)) {
    if (!relatedKeywords.find(r => r.keyword === related.keyword)) {
      relatedKeywords.push({
        keyword: related.keyword,
        volume: "중간",
        competition: "중간",
        trend: "유지",
        source: "naver_related"
      });
    }
  }

  // 템플릿 기반 추가 키워드
  const templateKeywords = [
    { suffix: " 방법", volume: "높음", competition: "중간" },
    { suffix: " 추천", volume: "매우 높음", competition: "높음" },
    { suffix: " 후기", volume: "높음", competition: "중간" },
    { suffix: " 비교", volume: "중간", competition: "낮음" },
    { suffix: " 가격", volume: "매우 높음", competition: "매우 높음" },
  ];

  for (const tmpl of templateKeywords) {
    const kw = keyword + tmpl.suffix;
    if (!relatedKeywords.find(r => r.keyword === kw)) {
      relatedKeywords.push({
        keyword: kw,
        volume: tmpl.volume,
        competition: tmpl.competition,
        trend: "유지",
        source: "template"
      });
    }
  }

  // 질문형 키워드 (자동완성 기반)
  const questionKeywords: any[] = [];
  if (includeQuestions) {
    const questionPrefixes = ["", "어떻게 ", "왜 ", "언제 ", "어디서 "];
    const questionSuffixes = ["란", "이란", " 뭐", " 무엇", " 어떻게", " 왜", " 방법"];

    // 자동완성에서 질문형 추출
    for (const ac of autocompleteKeywords) {
      if (questionSuffixes.some(s => ac.includes(s)) || ac.includes("?")) {
        questionKeywords.push({
          keyword: ac,
          type: detectQuestionType(ac),
          intent: detectSearchIntent(ac),
          source: "autocomplete"
        });
      }
    }

    // 기본 질문 템플릿
    if (questionKeywords.length < 5) {
      const defaultQuestions = [
        { keyword: `${keyword}이란?`, type: "정의", intent: "정보탐색" },
        { keyword: `${keyword} 어떻게 하나요?`, type: "방법", intent: "정보탐색" },
        { keyword: `${keyword} 왜 필요한가요?`, type: "이유", intent: "정보탐색" },
        { keyword: `${keyword} 얼마인가요?`, type: "가격", intent: "구매의도" },
      ];
      for (const q of defaultQuestions) {
        if (!questionKeywords.find(qk => qk.keyword === q.keyword)) {
          questionKeywords.push({ ...q, source: "template" });
        }
      }
    }
  }

  // 롱테일 키워드
  const longtailKeywords: any[] = [];
  if (includeLongtail) {
    // 자동완성에서 긴 키워드 추출
    for (const ac of autocompleteKeywords) {
      if (ac.length > keyword.length + 5 && !relatedKeywords.find(r => r.keyword === ac)) {
        longtailKeywords.push({
          keyword: ac,
          difficulty: Math.round(seoDifficulty * 0.6 + Math.random() * 20),
          opportunity: "높음",
          source: "autocomplete"
        });
      }
    }

    // 템플릿 기반 롱테일
    const longtailTemplates = [
      { pattern: `초보자를 위한 ${keyword} 완벽 가이드`, difficulty: 35 },
      { pattern: `${keyword} 실수 피하는 방법`, difficulty: 28 },
      { pattern: `2025년 ${keyword} 트렌드`, difficulty: 42 },
      { pattern: `${keyword} 비용 절약 팁`, difficulty: 31 },
      { pattern: `${keyword} 전문가 추천`, difficulty: 38 },
    ];

    for (const tmpl of longtailTemplates) {
      if (!longtailKeywords.find(l => l.keyword === tmpl.pattern)) {
        longtailKeywords.push({
          keyword: tmpl.pattern,
          difficulty: Math.round(tmpl.difficulty + (seoDifficulty - 50) * 0.3),
          opportunity: tmpl.difficulty < 35 ? "매우 높음" : "높음",
          source: "template"
        });
      }
    }
  }

  // 검색엔진별 전략
  const searchEngineStrategy = {
    naver: {
      result_count: naverResultCount.toLocaleString(),
      competition: estimateCompetition(naverResultCount).level,
      tips: [
        "네이버 블로그/포스트에 발행하세요",
        "키워드를 제목에 정확히 포함하세요",
        "이미지 ALT 태그에 키워드 추가",
        "체류시간을 늘리는 콘텐츠 작성",
        `경쟁 블로그 ${Math.min(naverResultCount, 1000000).toLocaleString()}개 이상 - 차별화 필수`,
      ],
      content_types: ["블로그", "포스트", "지식iN"],
    },
    google: {
      result_count: googleResultCount.toLocaleString(),
      competition: estimateCompetition(googleResultCount).level,
      tips: [
        "H1, H2 태그에 키워드 배치",
        "메타 디스크립션 최적화",
        "모바일 친화적 디자인 필수",
        "페이지 로딩 속도 개선",
        "백링크 확보 전략 수립",
      ],
      content_types: ["웹사이트", "유튜브", "뉴스"],
    },
    daum: {
      result_count: daumResultCount.toLocaleString(),
      competition: estimateCompetition(daumResultCount).level,
      tips: [
        "다음 블로그/카페에 발행하세요",
        "카카오 채널과 연동 고려",
        "티스토리 블로그 활용 추천",
        "다음 뉴스 검색 노출 전략",
        "카카오톡 공유 최적화",
      ],
      content_types: ["티스토리", "다음카페", "브런치"],
    },
  };

  // 추천 액션 생성
  const recommendedAction = seoDifficulty > 70
    ? "경쟁이 치열합니다. 롱테일 키워드로 진입 후 메인 키워드 공략을 권장합니다."
    : seoDifficulty > 50
    ? "중간 경쟁입니다. 고품질 콘텐츠와 꾸준한 발행이 중요합니다."
    : "경쟁이 낮습니다. 빠른 진입으로 선점 효과를 노리세요.";

  return {
    main_keyword: keyword,
    data_source: {
      daum_autocomplete: daumAutocomplete.length,
      naver_autocomplete: naverAutocomplete.length,
      google_autocomplete: googleAutocomplete.length,
      naver_related: naverRelated.length,
      daum_results: daumResultCount.toLocaleString(),
      naver_results: naverResultCount.toLocaleString(),
      google_results: googleResultCount.toLocaleString(),
    },
    overall_analysis: {
      search_volume: searchVolume,
      search_volume_indicator: keywordRank <= 3 ? "🔥 매우 높음" : keywordRank <= 6 ? "📈 높음" : "📊 보통",
      competition_level: competition.level,
      competition_score: competition.score,
      seo_difficulty: seoDifficulty,
      seo_difficulty_grade: seoDifficulty > 70 ? "어려움" : seoDifficulty > 50 ? "보통" : "쉬움",
      content_opportunity_score: opportunityScore,
      recommended_action: recommendedAction,
    },
    related_keywords: relatedKeywords.slice(0, 15),
    question_keywords: questionKeywords.slice(0, 8),
    longtail_keywords: longtailKeywords.slice(0, 8),
    search_engine_strategy: searchEngine === "all" ? searchEngineStrategy : searchEngineStrategy[searchEngine as keyof typeof searchEngineStrategy],
    content_recommendations: {
      ideal_length: seoDifficulty > 60 ? "4000-6000자 (경쟁 대응)" : "2500-4000자",
      must_include: ["정의", "방법", "예시", "FAQ", "비교"],
      format: seoDifficulty > 60 ? "종합 가이드 형식 (심층 분석)" : "핵심 정리 형식",
      media: ["이미지 5-10개", "인포그래픽 1개", "영상 임베드"],
      posting_frequency: seoDifficulty > 70 ? "주 3회 이상" : "주 1-2회",
    },
    competitor_insights: competitorAnalysis ? {
      estimated_competitors: primaryResultCount > 100000 ? "10만+" : primaryResultCount > 10000 ? "1만+" : "1천+",
      top_ranking_strategy: [
        "제목에 키워드 정확히 포함",
        "3000자 이상의 상세 콘텐츠",
        "이미지/영상 풍부하게 활용",
        "정기적인 업데이트",
      ],
      gap_opportunities: [
        "최신 2025년 트렌드 반영",
        "실제 사례/후기 포함",
        "비교 분석 콘텐츠",
        "FAQ 섹션 추가",
      ],
    } : null,
  };
}

// 질문 유형 감지
function detectQuestionType(text: string): string {
  if (/이란|무엇|뭐야|뜻/.test(text)) return "정의";
  if (/어떻게|방법|하는법/.test(text)) return "방법";
  if (/왜|이유/.test(text)) return "이유";
  if (/얼마|가격|비용/.test(text)) return "가격";
  if (/어디|장소|위치/.test(text)) return "장소";
  if (/언제|시간|기간/.test(text)) return "시간";
  return "일반";
}

// 검색 의도 감지
function detectSearchIntent(text: string): string {
  if (/구매|가격|얼마|싼|저렴|할인/.test(text)) return "구매의도";
  if (/vs|비교|차이|어떤게/.test(text)) return "비교검토";
  if (/후기|리뷰|평가|사용/.test(text)) return "사용경험";
  return "정보탐색";
}

// 고급 콘텐츠 캘린더 생성
function createAdvancedContentCalendar(
  topics: string[],
  durationWeeks: number,
  postsPerWeek: number,
  platforms: string[],
  includeEvents: boolean,
  contentMix: string
): any {
  const calendar: any[] = [];
  const startDate = new Date();

  // 콘텐츠 믹스 비율
  const mixRatios: Record<string, any> = {
    balanced: { educational: 40, entertaining: 30, promotional: 20, engaging: 10 },
    promotional: { educational: 20, entertaining: 20, promotional: 50, engaging: 10 },
    educational: { educational: 60, entertaining: 20, promotional: 10, engaging: 10 },
    entertaining: { educational: 20, entertaining: 50, promotional: 15, engaging: 15 },
  };

  const ratio = mixRatios[contentMix] || mixRatios.balanced;

  for (let week = 0; week < durationWeeks; week++) {
    const weekStart = new Date(startDate);
    weekStart.setDate(startDate.getDate() + week * 7);

    const weekPlan: any = {
      week: week + 1,
      start_date: weekStart.toISOString().split('T')[0],
      theme: topics[week % topics.length],
      posts: [],
      weekly_goals: generateWeeklyGoals(week, topics[week % topics.length]),
    };

    for (let post = 0; post < postsPerWeek; post++) {
      const postDate = new Date(weekStart);
      postDate.setDate(weekStart.getDate() + Math.floor((post / postsPerWeek) * 7));

      const dateStr = postDate.toISOString().split('T')[0];
      const monthDay = `${String(postDate.getMonth() + 1).padStart(2, '0')}-${String(postDate.getDate()).padStart(2, '0')}`;

      // 이벤트 체크
      const event = includeEvents ? KOREAN_EVENTS_DB.find(e => e.date === monthDay) : null;

      // 콘텐츠 타입 결정
      const contentType = determineContentType(post, ratio);
      const platform = platforms[post % platforms.length];

      weekPlan.posts.push({
        id: week * postsPerWeek + post + 1,
        date: dateStr,
        day: ["일", "월", "화", "수", "목", "금", "토"][postDate.getDay()],
        platform,
        content_type: contentType,
        topic: event
          ? `${event.name} 특집: ${topics[post % topics.length]}`
          : topics[post % topics.length],
        format_suggestion: getFormatSuggestion(platform, contentType),
        optimal_time: getOptimalTimeForPlatform(platform),
        special_event: event ? { name: event.name, type: event.type, ideas: event.contentIdeas } : null,
        status: "planned",
        checklist: ["아이디어 확정", "콘텐츠 제작", "해시태그 준비", "발행"],
      });
    }

    calendar.push(weekPlan);
  }

  // 이벤트 하이라이트
  const upcomingEvents = includeEvents ? getUpcomingEvents(durationWeeks * 7) : [];

  return {
    overview: {
      duration: `${durationWeeks}주`,
      total_posts: durationWeeks * postsPerWeek,
      platforms,
      topics,
      content_mix: ratio,
    },
    calendar,
    upcoming_events: upcomingEvents,
    recommendations: [
      "📅 주요 이벤트 1-2주 전에 관련 콘텐츠 준비",
      "🔄 일관된 발행 시간 유지",
      "📊 주간 단위로 성과 분석",
      "🎯 각 플랫폼의 알고리즘 특성 반영",
    ],
    monthly_themes: generateMonthlyThemes(startDate, durationWeeks),
  };
}

function generateWeeklyGoals(week: number, theme: string): string[] {
  return [
    `${theme} 관련 인게이지먼트 10% 향상`,
    "신규 팔로워 획득",
    "커뮤니티 참여 증대",
  ];
}

function determineContentType(index: number, ratio: any): string {
  const types = ["educational", "entertaining", "promotional", "engaging"];
  // 단순화된 로직
  return types[index % 4];
}

function getFormatSuggestion(platform: string, contentType: string): string {
  const formats: Record<string, Record<string, string>> = {
    instagram: {
      educational: "캐러셀 (5-10장)",
      entertaining: "릴스 (15-30초)",
      promotional: "단일 이미지 + 스토리",
      engaging: "스토리 투표/퀴즈",
    },
    youtube: {
      educational: "튜토리얼 (10-15분)",
      entertaining: "브이로그 (8-12분)",
      promotional: "쇼츠 (30-60초)",
      engaging: "라이브 스트리밍",
    },
    blog: {
      educational: "가이드 (3000자+)",
      entertaining: "후기/에세이 (2000자)",
      promotional: "제품 리뷰 (2500자)",
      engaging: "Q&A 포스트",
    },
    tiktok: {
      educational: "팁 영상 (30-60초)",
      entertaining: "트렌드 참여 (15-30초)",
      promotional: "제품 소개 (30초)",
      engaging: "듀엣/스티치",
    },
  };

  return formats[platform]?.[contentType] || "일반 포스트";
}

function getOptimalTimeForPlatform(platform: string): string {
  const times: Record<string, string> = {
    instagram: "12:00-13:00, 19:00-21:00",
    youtube: "토요일 14:00-16:00",
    blog: "09:00-11:00",
    tiktok: "19:00-22:00",
    newsletter: "화/목 09:00",
    threads: "08:00-09:00, 18:00-20:00",
    twitter: "12:00-13:00, 17:00-18:00",
  };

  return times[platform] || "09:00-11:00";
}

function generateMonthlyThemes(startDate: Date, weeks: number): any[] {
  const themes: any[] = [];
  const months = Math.ceil(weeks / 4);

  for (let i = 0; i < months; i++) {
    const monthDate = new Date(startDate);
    monthDate.setMonth(startDate.getMonth() + i);
    const monthName = monthDate.toLocaleString('ko-KR', { month: 'long' });

    themes.push({
      month: monthName,
      suggested_themes: getMonthlyThemeSuggestions(monthDate.getMonth() + 1),
    });
  }

  return themes;
}

function getMonthlyThemeSuggestions(month: number): string[] {
  const suggestions: Record<number, string[]> = {
    1: ["새해 계획", "신년 트렌드", "겨울 콘텐츠", "설날 준비"],
    2: ["발렌타인", "봄 준비", "연인 콘텐츠"],
    3: ["봄 시즌", "신학기", "화이트데이", "봄나들이"],
    4: ["벚꽃", "봄 패션", "아웃도어"],
    5: ["가정의 달", "어버이날", "야외활동", "여름 준비"],
    6: ["여름 시작", "휴가 계획", "다이어트"],
    7: ["휴가 시즌", "여름 패션", "물놀이"],
    8: ["말복", "여름 끝", "가을 준비"],
    9: ["새학기", "가을 패션", "추석 준비"],
    10: ["가을", "추석", "할로윈", "단풍"],
    11: ["블랙프라이데이", "연말 준비", "빼빼로데이"],
    12: ["연말 결산", "크리스마스", "송년", "선물"],
  };

  return suggestions[month] || ["시즌 콘텐츠"];
}

// 고급 경쟁사 분석
async function analyzeAdvancedCompetitorContent(urls: string[], depth: string, extractStrategy: boolean): Promise<any> {
  const results: any[] = [];

  for (const url of urls) {
    try {
      const response = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
        },
        timeout: 15000,
      });

      const $ = cheerio.load(response.data);

      const analysis: any = {
        url,
        title: $('title').text().trim(),
        meta_description: $('meta[name="description"]').attr('content') || '',
        og_title: $('meta[property="og:title"]').attr('content') || '',
        og_description: $('meta[property="og:description"]').attr('content') || '',
      };

      if (depth === "detailed" || depth === "comprehensive") {
        analysis.structure = {
          h1: $('h1').map((_, el) => $(el).text().trim()).get(),
          h2: $('h2').map((_, el) => $(el).text().trim()).get().slice(0, 15),
          h3: $('h3').map((_, el) => $(el).text().trim()).get().slice(0, 10),
        };

        const bodyText = $('body').text();
        analysis.content_stats = {
          word_count: bodyText.split(/\s+/).length,
          char_count: bodyText.length,
          images_count: $('img').length,
          videos_count: $('video, iframe[src*="youtube"], iframe[src*="vimeo"]').length,
          internal_links: $('a[href^="/"]').length,
          external_links: $('a[href^="http"]').not(`a[href*="${new URL(url).hostname}"]`).length,
        };
      }

      if (depth === "comprehensive") {
        // 키워드 분석
        const text = $('body').text().toLowerCase();
        const koreanWords = text.match(/[\uAC00-\uD7AF]{2,}/g) || [];
        const wordFreq: Record<string, number> = {};
        koreanWords.forEach(word => {
          if (word.length >= 2) wordFreq[word] = (wordFreq[word] || 0) + 1;
        });

        analysis.keyword_analysis = {
          top_keywords: Object.entries(wordFreq)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 30)
            .map(([word, count]) => ({ word, count, density: ((count / koreanWords.length) * 100).toFixed(2) + '%' })),
          total_keywords: koreanWords.length,
        };

        // 콘텐츠 구조 분석
        analysis.content_structure = {
          has_toc: $('[class*="toc"], [class*="table-of-contents"], #toc').length > 0,
          has_faq: $('[class*="faq"], [itemtype*="FAQPage"]').length > 0,
          has_author: $('[class*="author"], [rel="author"]').length > 0,
          schema_types: $('[itemtype]').map((_, el) => $(el).attr('itemtype')).get(),
        };
      }

      results.push(analysis);
    } catch (error: any) {
      results.push({ url, error: `분석 실패: ${error.message || '알 수 없는 오류'}` });
    }
  }

  // 전략 추출 (동적 분석 기반)
  let strategyInsights = null;
  if (extractStrategy && results.filter(r => !r.error).length > 0) {
    const validResults = results.filter(r => !r.error);
    const withStats = results.filter(r => r.content_stats);
    const withStructure = results.filter(r => r.content_structure);

    // 공통 패턴 동적 분석
    const commonPatterns: string[] = [];

    // H2 태그 분석
    const h2Counts = validResults.filter(r => r.structure?.h2?.length > 0);
    if (h2Counts.length > validResults.length * 0.5) {
      const avgH2 = Math.round(h2Counts.reduce((sum, r) => sum + r.structure.h2.length, 0) / h2Counts.length);
      commonPatterns.push(`H2 태그 평균 ${avgH2}개 사용 (섹션 구분)`);
    }

    // 이미지 분석
    if (withStats.length > 0) {
      const avgImages = Math.round(withStats.reduce((sum, r) => sum + r.content_stats.images_count, 0) / withStats.length);
      commonPatterns.push(avgImages > 5 ? `이미지 다수 활용 (평균 ${avgImages}개)` : `이미지 적게 사용 (평균 ${avgImages}개)`);
    }

    // 콘텐츠 구조 분석
    const hasToc = withStructure.filter(r => r.content_structure?.has_toc).length;
    const hasFaq = withStructure.filter(r => r.content_structure?.has_faq).length;
    if (hasToc > 0) commonPatterns.push(`목차(TOC) 제공 - ${hasToc}/${withStructure.length} 사이트`);
    if (hasFaq > 0) commonPatterns.push(`FAQ 섹션 포함 - ${hasFaq}/${withStructure.length} 사이트`);

    if (commonPatterns.length === 0) {
      commonPatterns.push("H2 태그로 주요 섹션 구분", "이미지와 텍스트 적절히 배합");
    }

    // 평균 지표 계산
    const avgWordCount = withStats.length > 0
      ? Math.round(withStats.reduce((sum, r) => sum + r.content_stats.word_count, 0) / withStats.length)
      : 0;
    const avgImages = withStats.length > 0
      ? Math.round(withStats.reduce((sum, r) => sum + r.content_stats.images_count, 0) / withStats.length)
      : 0;
    const avgVideos = withStats.length > 0
      ? Math.round(withStats.reduce((sum, r) => sum + r.content_stats.videos_count, 0) / withStats.length)
      : 0;

    // 기회 포인트 동적 생성
    const opportunities: string[] = [];

    if (avgVideos === 0) {
      opportunities.push("비디오 콘텐츠 추가로 차별화 가능 (경쟁사 비디오 미사용)");
    }
    if (hasFaq === 0 && withStructure.length > 0) {
      opportunities.push("FAQ 섹션 추가로 검색 노출 강화 (경쟁사 미적용)");
    }
    if (avgWordCount > 0 && avgWordCount < 2000) {
      opportunities.push(`콘텐츠 분량 확대 권장 (경쟁사 평균 ${avgWordCount}자)`);
    } else if (avgWordCount >= 2000) {
      opportunities.push(`상세 콘텐츠로 경쟁 중 - 핵심 정보 차별화 필요`);
    }
    if (hasToc === 0 && withStructure.length > 0) {
      opportunities.push("목차 추가로 사용자 경험 향상 가능");
    }

    // 키워드 기반 기회
    const allKeywords = validResults.flatMap(r => r.keyword_analysis?.top_keywords?.slice(0, 5) || []);
    if (allKeywords.length > 0) {
      const topKeywords = allKeywords.slice(0, 3).map(k => k.word).join(', ');
      opportunities.push(`핵심 키워드 집중: ${topKeywords}`);
    }

    if (opportunities.length === 0) {
      opportunities.push("더 상세한 가이드로 경쟁 우위 확보", "독자적인 관점/분석 추가");
    }

    strategyInsights = {
      common_patterns: commonPatterns.slice(0, 5),
      average_metrics: {
        avg_word_count: avgWordCount,
        avg_images: avgImages,
        avg_videos: avgVideos,
        sites_with_toc: hasToc,
        sites_with_faq: hasFaq,
      },
      opportunities: opportunities.slice(0, 5),
      recommendation: avgWordCount > 3000
        ? "경쟁사가 상세 콘텐츠 제공 중 - 품질과 차별화에 집중"
        : "콘텐츠 깊이와 분량으로 경쟁 우위 확보 가능",
      analyzed_sites: validResults.length,
    };
  }

  return {
    analyzed_at: new Date().toISOString(),
    analysis_depth: depth,
    total_urls: urls.length,
    successful: results.filter(r => !r.error).length,
    results,
    strategy_insights: strategyInsights,
  };
}

// 고급 바이럴 예측
function predictAdvancedViralScore(
  title: string,
  description: string,
  platform: string,
  hashtags: string[],
  contentType: string
): any {
  // 다양한 바이럴 요소 분석
  const factors = {
    // 감정 요소
    emotional: {
      positive: /최고|완벽|대박|필수|추천|굿|좋은|행복|성공|감동/g,
      negative: /충격|경악|실화|심각|위험|주의|경고/g,
      curiosity: /비밀|숨겨진|몰랐던|알려지지|진실|실체/g,
    },
    // 구조 요소
    structural: {
      numbers: /\d+/g,
      questions: /\?/g,
      brackets: /\[|\]/g,
      emphasis: /!/g,
    },
    // 긴급성
    urgency: /지금|당장|오늘|한정|마감|급|바로|즉시|놓치면/g,
    // 사회적 증거
    socialProof: /만명|팔로워|구독자|조회수|리뷰|후기|인증|추천|화제/g,
    // 실용성
    utility: /방법|팁|가이드|정리|비법|노하우|꿀팁|해결/g,
  };

  let score = 50;
  const analysis: any = {};

  // 감정 분석
  const positiveMatches = (title + description).match(factors.emotional.positive);
  const negativeMatches = (title + description).match(factors.emotional.negative);
  const curiosityMatches = (title + description).match(factors.emotional.curiosity);

  if (positiveMatches) { score += Math.min(positiveMatches.length * 5, 15); }
  if (negativeMatches) { score += Math.min(negativeMatches.length * 4, 12); }
  if (curiosityMatches) { score += Math.min(curiosityMatches.length * 6, 18); }

  analysis.emotional_triggers = {
    positive: positiveMatches?.length || 0,
    negative: negativeMatches?.length || 0,
    curiosity: curiosityMatches?.length || 0,
  };

  // 구조 분석
  const hasNumbers = factors.structural.numbers.test(title);
  const hasQuestion = factors.structural.questions.test(title);
  const hasBrackets = factors.structural.brackets.test(title);
  const hasEmphasis = factors.structural.emphasis.test(title);

  if (hasNumbers) score += 10;
  if (hasQuestion) score += 8;
  if (hasBrackets) score += 5;
  if (hasEmphasis) score += 3;

  analysis.structural_elements = { hasNumbers, hasQuestion, hasBrackets, hasEmphasis };

  // 긴급성
  if (factors.urgency.test(title + description)) score += 8;

  // 사회적 증거
  if (factors.socialProof.test(title + description)) score += 10;

  // 실용성
  if (factors.utility.test(title + description)) score += 7;

  // 제목 길이 최적화
  if (title.length >= 20 && title.length <= 45) score += 5;
  else if (title.length > 60) score -= 5;

  // 해시태그 분석
  if (hashtags.length >= 5 && hashtags.length <= 15) score += 5;
  else if (hashtags.length > 25) score -= 3;

  // 콘텐츠 타입 보너스
  const typeBonus: Record<string, number> = {
    video: 10,
    reel: 15,
    carousel: 8,
    image: 5,
    text: 0,
  };
  score += typeBonus[contentType] || 0;

  // 플랫폼별 조정
  const platformMultiplier: Record<string, number> = {
    tiktok: 1.2,
    instagram: 1.1,
    youtube: 1.0,
    twitter: 0.9,
    blog: 0.8,
  };
  score = Math.round(score * (platformMultiplier[platform] || 1));

  score = Math.min(Math.max(score, 0), 100);

  // 등급 결정
  const grade = score >= 85 ? "S (바이럴 예상)"
    : score >= 70 ? "A (높은 잠재력)"
    : score >= 55 ? "B (양호)"
    : score >= 40 ? "C (개선 필요)"
    : "D (재검토 필요)";

  // 개선 제안
  const improvements: string[] = [];
  if (!hasNumbers) improvements.push("숫자를 추가하세요 (예: '5가지 방법')");
  if (!curiosityMatches) improvements.push("호기심을 자극하는 표현을 추가하세요");
  if (!hasQuestion && !hasEmphasis) improvements.push("질문형이나 감탄형을 시도해보세요");
  if (title.length > 50) improvements.push("제목을 50자 이내로 줄이세요");
  if (hashtags.length < 5) improvements.push("관련 해시태그를 5개 이상 추가하세요");
  if (contentType === "text") improvements.push("이미지나 영상을 추가하면 참여율이 높아집니다");

  return {
    title,
    content_type: contentType,
    platform,
    viral_score: score,
    grade,
    analysis: {
      ...analysis,
      title_length: title.length,
      hashtag_count: hashtags.length,
      urgency_detected: factors.urgency.test(title + description),
      social_proof_detected: factors.socialProof.test(title + description),
      utility_detected: factors.utility.test(title + description),
    },
    improvements,
    predicted_performance: {
      reach: score >= 70 ? "높음" : score >= 50 ? "보통" : "낮음",
      engagement: score >= 75 ? "높음" : score >= 55 ? "보통" : "낮음",
      shares: score >= 80 ? "높음" : score >= 60 ? "보통" : "낮음",
      saves: score >= 65 ? "높음" : score >= 45 ? "보통" : "낮음",
    },
    optimized_title_suggestions: [
      hasNumbers ? null : `${title.slice(0, 20)}... 5가지 방법`,
      hasQuestion ? null : `${title}?`,
      `[필독] ${title}`,
    ].filter(Boolean).slice(0, 3),
  };
}

// 뉴스 분석 - 실제 스크래핑
async function analyzeKoreanNews(category: string, timeRange: string, extractKeywords: boolean): Promise<any> {
  const news: any[] = [];
  const allKeywords: string[] = [];

  // 카테고리별 네이버 뉴스 섹션 URL
  const categoryUrls: Record<string, string> = {
    general: 'https://news.naver.com/',
    politics: 'https://news.naver.com/section/100',
    economy: 'https://news.naver.com/section/101',
    society: 'https://news.naver.com/section/102',
    culture: 'https://news.naver.com/section/103',
    tech: 'https://news.naver.com/section/105',
    sports: 'https://sports.news.naver.com/',
    entertainment: 'https://entertain.naver.com/home',
  };

  const url = categoryUrls[category] || categoryUrls.general;

  try {
    // 네이버 뉴스 스크래핑
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'ko-KR,ko;q=0.9',
      },
      timeout: 10000,
    });

    const $ = cheerio.load(response.data);

    // 헤드라인 추출 - 다양한 셀렉터 시도
    const headlineSelectors = [
      '.cjs_t', // 네이버 뉴스 메인
      '.sa_text_title',
      'a.news_tit',
      '.cluster_text_headline',
      '.cluster_head_topic',
      'h2.tit',
      '.link_news',
      '[class*="headline"] a',
      '[class*="title"] a',
    ];

    for (const selector of headlineSelectors) {
      if (news.length >= 15) break;

      $(selector).each((i, el) => {
        if (news.length >= 15) return false;

        const headline = $(el).text().trim();
        const href = $(el).attr('href') || '';

        if (headline && headline.length > 10 && headline.length < 100) {
          // 중복 체크
          if (!news.find(n => n.headline === headline)) {
            const sentiment = analyzeSentiment(headline);

            news.push({
              headline,
              source: detectNewsSource(href, category),
              sentiment,
              url: href.startsWith('http') ? href : `https://news.naver.com${href}`,
            });

            // 키워드 추출
            if (extractKeywords) {
              const words = extractKeywordsFromText(headline);
              allKeywords.push(...words);
            }
          }
        }
      });
    }
  } catch (error) {
    // 네이버 실패 시 다음 뉴스 시도
    try {
      const daumNews = await scrapeDaumNews(category);
      news.push(...daumNews);

      if (extractKeywords) {
        daumNews.forEach(n => {
          allKeywords.push(...extractKeywordsFromText(n.headline));
        });
      }
    } catch {
      // 모두 실패 시 Fallback
    }
  }

  // Fallback: 뉴스가 없으면 기본 데이터
  if (news.length === 0) {
    news.push(...getNewsFallback(category));
  }

  // 키워드 빈도 계산
  const keywordFrequency = extractKeywords ? calculateKeywordFrequency(allKeywords) : [];

  // 감성 분석 요약
  const sentiments = news.map(n => n.sentiment);
  const positiveCount = sentiments.filter(s => s === 'positive').length;
  const negativeCount = sentiments.filter(s => s === 'negative').length;
  const neutralCount = sentiments.filter(s => s === 'neutral').length;
  const total = sentiments.length || 1;

  return {
    category,
    time_range: timeRange,
    analyzed_at: new Date().toISOString(),
    source: news.length > 0 && news[0].url?.includes('naver') ? 'naver_news' : 'daum_news',
    top_news: news.slice(0, 10),
    extracted_keywords: keywordFrequency.slice(0, 10),
    sentiment_summary: {
      positive: `${Math.round((positiveCount / total) * 100)}%`,
      neutral: `${Math.round((neutralCount / total) * 100)}%`,
      negative: `${Math.round((negativeCount / total) * 100)}%`,
    },
    content_opportunities: generateNewsContentOpportunities(keywordFrequency, category),
    trending_topics: news.slice(0, 5).map(n => n.headline),
  };
}

// 다음 뉴스 스크래핑
async function scrapeDaumNews(category: string): Promise<any[]> {
  const categoryUrls: Record<string, string> = {
    general: 'https://news.daum.net/',
    politics: 'https://news.daum.net/politics',
    economy: 'https://news.daum.net/economic',
    society: 'https://news.daum.net/society',
    culture: 'https://news.daum.net/culture',
    tech: 'https://news.daum.net/digital',
    sports: 'https://sports.daum.net/',
    entertainment: 'https://entertain.daum.net/',
  };

  const url = categoryUrls[category] || categoryUrls.general;

  const response = await axios.get(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      'Accept-Language': 'ko-KR,ko;q=0.9',
    },
    timeout: 8000,
  });

  const $ = cheerio.load(response.data);
  const news: any[] = [];

  $('[class*="link_txt"], .tit_g, .news_view, .txt_info').each((i, el) => {
    if (news.length >= 10) return false;

    const headline = $(el).text().trim();
    if (headline && headline.length > 10 && headline.length < 100) {
      if (!news.find(n => n.headline === headline)) {
        news.push({
          headline,
          source: '다음뉴스',
          sentiment: analyzeSentiment(headline),
        });
      }
    }
  });

  return news;
}

// 감성 분석 (간단 버전)
function analyzeSentiment(text: string): 'positive' | 'neutral' | 'negative' {
  const positiveWords = /성공|상승|호조|기대|돌파|신기록|수상|인기|사랑|행복|좋은|최고|혁신|성장/;
  const negativeWords = /하락|위기|우려|실패|폭락|충격|논란|피해|사망|사고|비난|급락|위험|문제/;

  if (positiveWords.test(text)) return 'positive';
  if (negativeWords.test(text)) return 'negative';
  return 'neutral';
}

// 뉴스 소스 감지
function detectNewsSource(url: string, category: string): string {
  if (url.includes('sports')) return '스포츠';
  if (url.includes('entertain')) return '연예';

  const sources: Record<string, string> = {
    politics: '정치',
    economy: '경제',
    society: '사회',
    culture: '문화',
    tech: 'IT/과학',
    sports: '스포츠',
    entertainment: '연예',
  };

  return sources[category] || '종합';
}

// 텍스트에서 키워드 추출
function extractKeywordsFromText(text: string): string[] {
  // 특수문자 제거 후 2-6자 단어만 추출
  const words = text
    .replace(/[^\w\sㄱ-ㅎㅏ-ㅣ가-힣]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length >= 2 && w.length <= 6)
    .filter(w => !/^\d+$/.test(w)); // 숫자만 있는 것 제외

  return words;
}

// 키워드 빈도 계산
function calculateKeywordFrequency(words: string[]): any[] {
  const frequency: Record<string, number> = {};

  words.forEach(word => {
    frequency[word] = (frequency[word] || 0) + 1;
  });

  return Object.entries(frequency)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([keyword, freq]) => ({
      keyword,
      frequency: freq,
      trend: freq >= 5 ? '상승' : freq >= 3 ? '유지' : '일반',
    }));
}

// 뉴스 기반 콘텐츠 기회 생성
function generateNewsContentOpportunities(keywords: any[], category: string): string[] {
  const opportunities: string[] = [];

  if (keywords.length > 0) {
    const topKeyword = keywords[0]?.keyword || '';
    opportunities.push(`"${topKeyword}" 관련 콘텐츠 수요 증가 - 해설/분석 콘텐츠 추천`);
  }

  const categoryOpportunities: Record<string, string[]> = {
    tech: ['AI/테크 트렌드 정리 콘텐츠', '신제품 리뷰 콘텐츠'],
    economy: ['재테크 팁 콘텐츠', '경제 뉴스 쉽게 풀어주기'],
    entertainment: ['K-콘텐츠 글로벌 화제', '연예 이슈 정리'],
    sports: ['경기 하이라이트', '선수 인터뷰 분석'],
    general: ['오늘의 이슈 정리', '트렌드 분석 콘텐츠'],
  };

  opportunities.push(...(categoryOpportunities[category] || categoryOpportunities.general));

  return opportunities.slice(0, 5);
}

// 뉴스 Fallback 데이터
function getNewsFallback(category: string): any[] {
  const now = new Date();
  const dateStr = now.toISOString().split('T')[0];
  const hour = now.getHours();
  const dayOfWeek = now.getDay();
  const month = now.getMonth() + 1;

  // 이벤트 기반 헤드라인 생성
  const eventKeywords = getEventBasedKeywords();
  const { seasonal } = generateDynamicKeywords();

  // 시간대별 뉴스 성격
  const timeContext = hour >= 6 && hour <= 9 ? "아침"
    : hour >= 12 && hour <= 14 ? "점심"
    : hour >= 18 && hour <= 21 ? "저녁" : "심야";

  // 요일별 뉴스 성격
  const dayContext = dayOfWeek === 0 ? "일요일" : dayOfWeek === 6 ? "토요일" : "평일";

  // 카테고리별 동적 헤드라인 생성
  const dynamicHeadlines: Record<string, () => any[]> = {
    general: () => [
      { headline: `[${timeContext} 브리핑] ${dateStr} 오늘의 주요 뉴스`, source: "종합", sentiment: "neutral" },
      { headline: eventKeywords[0] ? `${eventKeywords[0]} 관련 이슈 정리` : "AI 기술 발전과 산업 변화", source: "종합", sentiment: "neutral" },
      { headline: `${month}월 ${dayContext} 주요 이슈`, source: "종합", sentiment: "neutral" },
      { headline: seasonal[0] ? `${seasonal[0]} 트렌드 분석` : "글로벌 경제 동향", source: "종합", sentiment: "neutral" },
    ],
    tech: () => [
      { headline: `[${timeContext}] AI 업계 최신 동향`, source: "IT/과학", sentiment: "positive" },
      { headline: `${month}월 테크 기업 신제품 소식`, source: "IT/과학", sentiment: "positive" },
      { headline: "빅테크 기업 AI 전략 업데이트", source: "IT/과학", sentiment: "positive" },
      { headline: eventKeywords[0] ? `${eventKeywords[0]} 관련 IT 이슈` : "사이버 보안 동향", source: "IT/과학", sentiment: "neutral" },
    ],
    economy: () => [
      { headline: `[${timeContext}] 증시 동향 - 코스피/코스닥`, source: "경제", sentiment: "neutral" },
      { headline: `${month}월 부동산 시장 분석`, source: "경제", sentiment: "neutral" },
      { headline: `오늘의 환율 현황 (${dateStr})`, source: "경제", sentiment: "neutral" },
      { headline: dayOfWeek === 1 ? "주간 경제 전망" : "글로벌 금융 시장 동향", source: "경제", sentiment: "neutral" },
    ],
    entertainment: () => [
      { headline: `[${timeContext}] 연예계 HOT 이슈`, source: "연예", sentiment: "positive" },
      { headline: eventKeywords[0] ? `${eventKeywords[0]} 스타 근황` : "K-POP 글로벌 차트 석권", source: "연예", sentiment: "positive" },
      { headline: `${month}월 드라마/예능 화제작`, source: "연예", sentiment: "positive" },
      { headline: dayOfWeek === 0 || dayOfWeek === 6 ? "주말 예능 하이라이트" : "연예계 소식", source: "연예", sentiment: "neutral" },
    ],
    sports: () => [
      { headline: `[${timeContext}] 스포츠 주요 경기 결과`, source: "스포츠", sentiment: "neutral" },
      { headline: `${month}월 프로 스포츠 하이라이트`, source: "스포츠", sentiment: "positive" },
      { headline: dayOfWeek === 0 || dayOfWeek === 6 ? "주말 경기 일정" : "평일 스포츠 이슈", source: "스포츠", sentiment: "neutral" },
    ],
    politics: () => [
      { headline: `[${timeContext}] 정치 주요 뉴스`, source: "정치", sentiment: "neutral" },
      { headline: `${month}월 국회 동향`, source: "정치", sentiment: "neutral" },
      { headline: "정부 정책 업데이트", source: "정치", sentiment: "neutral" },
    ],
    society: () => [
      { headline: `[${timeContext}] 사회 이슈 브리핑`, source: "사회", sentiment: "neutral" },
      { headline: seasonal[0] ? `${seasonal[0]} 관련 사회 이슈` : "생활 밀착 뉴스", source: "사회", sentiment: "neutral" },
      { headline: `${month}월 사회 트렌드`, source: "사회", sentiment: "neutral" },
    ],
  };

  const generator = dynamicHeadlines[category] || dynamicHeadlines.general;
  return generator().map(item => ({
    ...item,
    url: "#",
    generated_at: now.toISOString(),
    source_type: "dynamic_fallback"
  }));
}

// 해시태그 전략 생성
function generateAdvancedHashtagStrategy(
  topic: string,
  platform: string,
  count: number,
  includeKorean: boolean,
  includeEnglish: boolean
): any {
  const koreanHashtags = [
    { tag: `#${topic.replace(/\s/g, '')}`, type: "main", popularity: "높음" },
    { tag: `#${topic}팁`, type: "related", popularity: "중간" },
    { tag: `#${topic}추천`, type: "related", popularity: "높음" },
    { tag: "#일상", type: "general", popularity: "매우 높음" },
    { tag: "#데일리", type: "general", popularity: "매우 높음" },
    { tag: "#소통", type: "engagement", popularity: "높음" },
    { tag: "#맞팔", type: "engagement", popularity: "높음" },
    { tag: "#좋아요", type: "engagement", popularity: "매우 높음" },
    { tag: "#인스타그램", type: "platform", popularity: "매우 높음" },
    { tag: "#정보공유", type: "content", popularity: "중간" },
    { tag: "#꿀팁", type: "content", popularity: "높음" },
    { tag: "#추천", type: "content", popularity: "높음" },
    { tag: "#리뷰", type: "content", popularity: "높음" },
    { tag: "#브이로그", type: "format", popularity: "높음" },
    { tag: "#2025", type: "time", popularity: "중간" },
  ];

  const englishHashtags = [
    { tag: "#instagood", type: "general", popularity: "매우 높음" },
    { tag: "#photooftheday", type: "general", popularity: "매우 높음" },
    { tag: "#love", type: "emotion", popularity: "매우 높음" },
    { tag: "#beautiful", type: "emotion", popularity: "높음" },
    { tag: "#happy", type: "emotion", popularity: "높음" },
    { tag: "#followme", type: "engagement", popularity: "높음" },
    { tag: "#like4like", type: "engagement", popularity: "중간" },
    { tag: "#style", type: "lifestyle", popularity: "높음" },
    { tag: "#lifestyle", type: "lifestyle", popularity: "높음" },
    { tag: "#tips", type: "content", popularity: "중간" },
  ];

  let allHashtags: any[] = [];
  if (includeKorean) allHashtags = [...allHashtags, ...koreanHashtags];
  if (includeEnglish) allHashtags = [...allHashtags, ...englishHashtags];

  // 플랫폼별 최적화
  const platformLimits: Record<string, number> = {
    instagram: 30,
    tiktok: 5,
    youtube: 15,
    twitter: 5,
    threads: 10,
  };

  const recommendedCount = Math.min(count, platformLimits[platform] || 20);

  return {
    topic,
    platform,
    strategy: {
      total_hashtags: recommendedCount,
      mix_ratio: {
        main_keyword: "10%",
        related: "30%",
        general: "30%",
        engagement: "20%",
        trending: "10%",
      },
    },
    hashtags: {
      high_priority: allHashtags.filter(h => h.popularity === "매우 높음").slice(0, 5),
      medium_priority: allHashtags.filter(h => h.popularity === "높음").slice(0, 10),
      niche: allHashtags.filter(h => h.popularity === "중간").slice(0, 10),
    },
    all_hashtags: allHashtags.slice(0, recommendedCount).map(h => h.tag),
    copy_paste: allHashtags.slice(0, recommendedCount).map(h => h.tag).join(' '),
    tips: [
      `${platform}에서는 ${recommendedCount}개 이하의 해시태그를 권장합니다`,
      "인기 해시태그와 니치 해시태그를 섞어 사용하세요",
      "첫 댓글에 해시태그를 넣으면 캡션이 깔끔해집니다",
      "트렌딩 해시태그는 주기적으로 업데이트하세요",
    ],
  };
}

// 벤치마크 데이터 (실시간)
async function getBenchmarkData(category: string, platform: string, metric: string): Promise<any> {
  // 실시간 벤치마크 계산
  const realTimeBenchmark = await calculateRealTimeBenchmark(category, platform);

  // 플랫폼별 추가 실시간 데이터 수집 시도
  let liveData: any = null;
  try {
    if (platform === 'instagram') {
      liveData = await getInstagramHashtagStats(category);
    } else if (platform === 'youtube') {
      liveData = await getYouTubeBenchmarkFromSocialBlade(category);
    } else if (platform === 'blog') {
      liveData = await getNaverBlogBenchmark(category);
    } else if (platform === 'tiktok') {
      liveData = await getTikTokTrendBenchmark(category);
    }
  } catch {
    // 실시간 수집 실패 시 기본 벤치마크 사용
  }

  const benchmarkData = realTimeBenchmark.benchmark;

  // 실시간 데이터가 있으면 병합
  if (liveData) {
    if (liveData.avg_posts) benchmarkData.estimated_posts_per_day = liveData.avg_posts;
    if (liveData.avg_engagement) benchmarkData.live_engagement_rate = liveData.avg_engagement;
    if (liveData.top_hashtags) benchmarkData.trending_hashtags = liveData.top_hashtags;
    if (liveData.avg_views) benchmarkData.avg_views = liveData.avg_views;
    if (liveData.avg_subscribers) benchmarkData.avg_subscribers = liveData.avg_subscribers;
  }

  // 시간대별 최적 포스팅 시간 계산
  const hour = new Date().getHours();
  const optimalTimes = platform === 'instagram'
    ? ['19:00-21:00', '12:00-13:00', '07:00-09:00']
    : platform === 'youtube'
    ? ['17:00-20:00', '12:00-14:00', '21:00-23:00']
    : platform === 'tiktok'
    ? ['18:00-22:00', '11:00-13:00', '06:00-08:00']
    : ['09:00-11:00', '14:00-16:00', '19:00-21:00'];

  // 현재 시간이 최적 시간대인지 체크
  const isOptimalTime = (hour >= 19 && hour <= 21) || (hour >= 12 && hour <= 13);

  return {
    category,
    platform,
    benchmark_data: benchmarkData,
    data_source: liveData ? 'live_scraping' : 'calculated_benchmark',
    time_adjusted: true,
    time_multiplier: realTimeBenchmark.time_adjustment.time_multiplier,
    day_multiplier: realTimeBenchmark.time_adjustment.day_multiplier,
    industry_average: {
      engagement_rate: `${benchmarkData.base_engagement || benchmarkData.avg_engagement || 3.5}%`,
      best_posting_frequency: platform === 'youtube' ? '주 2-3회' : platform === 'blog' ? '주 3-5회' : '매일 1-2회',
      optimal_posting_times: optimalTimes,
      current_time_status: isOptimalTime ? '✅ 지금이 최적 시간대입니다!' : '⏰ 최적 시간대를 기다려보세요',
    },
    performance_tiers: {
      top_10_percent: {
        description: "벤치마크의 200% 이상",
        engagement_threshold: `${Math.round((benchmarkData.base_engagement || 3.5) * 2 * 10) / 10}%+`,
      },
      above_average: {
        description: "벤치마크의 120-200%",
        engagement_range: `${Math.round((benchmarkData.base_engagement || 3.5) * 1.2 * 10) / 10}% - ${Math.round((benchmarkData.base_engagement || 3.5) * 2 * 10) / 10}%`,
      },
      average: {
        description: "벤치마크의 80-120%",
        engagement_range: `${Math.round((benchmarkData.base_engagement || 3.5) * 0.8 * 10) / 10}% - ${Math.round((benchmarkData.base_engagement || 3.5) * 1.2 * 10) / 10}%`,
      },
      below_average: {
        description: "벤치마크의 80% 미만",
        engagement_threshold: `${Math.round((benchmarkData.base_engagement || 3.5) * 0.8 * 10) / 10}% 미만`,
      },
    },
    platform_specific_tips: getCategoryPlatformTips(platform, category),
    tips_to_improve: [
      "일관된 포스팅 스케줄 유지",
      "고품질 비주얼 콘텐츠 제작",
      "커뮤니티와 적극적인 소통",
      "트렌드 키워드 및 해시태그 활용",
      isOptimalTime ? "지금 바로 콘텐츠를 발행하세요!" : `${optimalTimes[0]} 시간대에 발행을 추천합니다`,
    ],
    calculated_at: realTimeBenchmark.calculated_at,
  };
}

// 카테고리별 플랫폼 팁 생성
function getCategoryPlatformTips(platform: string, category: string): string[] {
  const tips: Record<string, Record<string, string[]>> = {
    instagram: {
      뷰티: ["릴스에서 메이크업 튜토리얼 공유", "Before/After 콘텐츠 활용", "스와이프 가이드 활용"],
      테크: ["제품 언박싱 릴스", "사용 팁 카드뉴스", "기술 비교 인포그래픽"],
      푸드: ["ASMR 요리 릴스", "레시피 카드 저장 유도", "먹방 스토리 활용"],
      default: ["릴스 콘텐츠 강화", "스토리 적극 활용", "해시태그 최적화"],
    },
    youtube: {
      뷰티: ["썸네일에 Before/After 강조", "쇼츠로 빠른 팁 공유", "챕터 활용"],
      테크: ["비교 리뷰 콘텐츠", "언박싱 + 한달 사용기", "숏폼으로 핵심 정리"],
      푸드: ["레시피 타임라인 제공", "ASMR 조리 영상", "쇼츠로 30초 레시피"],
      default: ["매력적인 썸네일 제작", "쇼츠 적극 활용", "커뮤니티 탭 활용"],
    },
    tiktok: {
      뷰티: ["트렌드 사운드 활용", "듀엣 챌린지 참여", "GRWM 콘텐츠"],
      테크: ["제품 해킹 팁", "포장 풀기 리액션", "가성비 추천"],
      푸드: ["음식 ASMR", "먹방 리액션", "쉬운 레시피 공유"],
      default: ["트렌딩 사운드 사용", "듀엣/스티치 활용", "후킹 3초 내 승부"],
    },
    blog: {
      뷰티: ["상세 리뷰 + 비포/애프터", "성분 분석 콘텐츠", "시즌별 추천"],
      테크: ["스펙 비교표 제공", "실사용 후기 중심", "가격 비교 정보"],
      푸드: ["상세 레시피 + 팁", "맛집 리스트업", "영양 정보 포함"],
      default: ["키워드 최적화", "상세한 정보 제공", "이미지 다수 삽입"],
    },
  };

  return tips[platform]?.[category] || tips[platform]?.default || [
    "일관된 콘텐츠 스타일 유지",
    "트렌드에 빠르게 대응",
    "커뮤니티 소통 강화",
  ];
}

// A/B 테스트 변형 생성
function generateABTestVariants(originalContent: string, element: string, count: number): any {
  const variants: any[] = [];

  if (element === "title") {
    const patterns = [
      { pattern: `[완벽정리] ${originalContent}`, style: "bracket" },
      { pattern: `${originalContent} (이것만 보세요)`, style: "parenthesis" },
      { pattern: `${originalContent}? 전문가가 답합니다`, style: "question" },
      { pattern: `99%가 모르는 ${originalContent}`, style: "curiosity" },
      { pattern: `${originalContent} 하는 5가지 방법`, style: "listicle" },
      { pattern: `오늘부터 시작하는 ${originalContent}`, style: "action" },
      { pattern: `${originalContent}: 초보자 필독`, style: "target" },
      { pattern: `${originalContent}의 모든 것`, style: "comprehensive" },
      { pattern: `당신이 몰랐던 ${originalContent}`, style: "reveal" },
      { pattern: `${originalContent} 실패하지 않는 법`, style: "negative" },
    ];

    for (let i = 0; i < Math.min(count, patterns.length); i++) {
      variants.push({
        variant_id: String.fromCharCode(65 + i),
        content: patterns[i].pattern,
        style: patterns[i].style,
        predicted_ctr: Math.floor(Math.random() * 30) + 70,
      });
    }
  } else if (element === "cta") {
    const ctas = [
      "지금 바로 확인하기",
      "더 알아보기",
      "무료로 시작하기",
      "자세히 보기",
      "놓치지 마세요",
      "지금 신청하기",
      "한정 기회",
      "바로 체험하기",
    ];

    for (let i = 0; i < Math.min(count, ctas.length); i++) {
      variants.push({
        variant_id: String.fromCharCode(65 + i),
        content: ctas[i],
        style: i < 3 ? "action" : "urgency",
        predicted_click_rate: Math.floor(Math.random() * 20) + 60,
      });
    }
  } else if (element === "description") {
    const styles = ["concise", "detailed", "emotional", "factual", "story"];

    for (let i = 0; i < Math.min(count, 5); i++) {
      variants.push({
        variant_id: String.fromCharCode(65 + i),
        style: styles[i],
        content: `[${styles[i]} 스타일] ${originalContent}`,
        predicted_engagement: Math.floor(Math.random() * 25) + 65,
      });
    }
  }

  return {
    original: originalContent,
    element_tested: element,
    variants,
    testing_recommendation: {
      sample_size: "최소 1,000명 노출 후 판단",
      duration: "최소 7일",
      metrics_to_track: element === "title" ? ["CTR", "조회수"] : element === "cta" ? ["클릭율", "전환율"] : ["체류시간", "이탈율"],
    },
    statistical_note: "95% 신뢰구간 확보를 위해 충분한 데이터 수집 필요",
  };
}

// 시즌 콘텐츠 가이드
function getSeasonalContentGuide(daysAhead: number, category: string): any {
  const events = getUpcomingEvents(daysAhead);
  const filteredEvents = category === "all"
    ? events
    : events.filter(e => e.type === category);

  const guide = filteredEvents.map(event => ({
    ...event,
    content_preparation_timeline: {
      research: `D-${Math.max(event.days_until - 14, 1)}`,
      content_creation: `D-${Math.max(event.days_until - 7, 1)}`,
      publishing: `D-${Math.max(event.days_until - 3, 0)} ~ D-${event.days_until}`,
      follow_up: `D+1 ~ D+3`,
    },
    recommended_content_types: [
      "이벤트 관련 가이드",
      "시즌 추천 리스트",
      "타임라인 콘텐츠",
      "사용자 참여형 콘텐츠",
    ],
    hashtag_suggestions: event.contentIdeas?.map((idea: string) => `#${idea.replace(/\s/g, '')}`) || [],
  }));

  return {
    period: `${daysAhead}일`,
    category,
    total_events: filteredEvents.length,
    events: guide,
    general_tips: [
      "주요 이벤트 2주 전에 콘텐츠 기획 시작",
      "이벤트 당일보다 1-3일 전 발행이 효과적",
      "이벤트 후 후기/정리 콘텐츠도 준비",
      "연관 키워드 미리 확보",
    ],
    monthly_focus: getMonthlyFocus(),
  };
}

function getMonthlyFocus(): any {
  const month = new Date().getMonth() + 1;
  const focuses: Record<number, any> = {
    1: { theme: "새해/신년", keywords: ["새해 계획", "신년 운세", "2025 트렌드"] },
    2: { theme: "발렌타인/겨울", keywords: ["발렌타인 선물", "커플", "초콜릿"] },
    3: { theme: "봄/신학기", keywords: ["봄맞이", "신학기", "화이트데이"] },
    4: { theme: "벚꽃/봄나들이", keywords: ["벚꽃명소", "봄 패션", "피크닉"] },
    5: { theme: "가정의 달", keywords: ["어버이날", "어린이날", "스승의날"] },
    6: { theme: "초여름/휴가", keywords: ["여름 휴가", "워케이션", "다이어트"] },
    7: { theme: "휴가 시즌", keywords: ["바캉스", "물놀이", "여행"] },
    8: { theme: "여름 끝/가을 준비", keywords: ["말복", "가을 신상", "처서"] },
    9: { theme: "추석/가을", keywords: ["추석 선물", "가을 패션", "단풍"] },
    10: { theme: "가을/할로윈", keywords: ["할로윈", "가을 나들이", "코스튬"] },
    11: { theme: "연말 준비", keywords: ["블프", "빼빼로데이", "연말 선물"] },
    12: { theme: "연말/크리스마스", keywords: ["크리스마스", "연말 파티", "송년회"] },
  };

  return focuses[month] || focuses[1];
}

// =============================================================================
// Tool 13: 썸네일 분석 (analyze_thumbnail) - v2.5 신규
// =============================================================================

server.tool(
  "analyze_thumbnail",
  "YouTube/Instagram 썸네일 컨셉을 분석하고 개선점을 제안합니다. 클릭률 최적화 가이드를 제공합니다.",
  {
    title: z.string().describe("콘텐츠 제목"),
    thumbnail_description: z.string().describe("썸네일 설명 (예: 놀란 표정의 사람, 음식 클로즈업)"),
    platform: z.enum(["youtube", "instagram", "tiktok", "blog"]).describe("플랫폼"),
    content_category: z.string().optional().describe("콘텐츠 카테고리 (예: 먹방, 뷰티, 테크)"),
  },
  async ({ title, thumbnail_description, platform, content_category = "일반" }) => {
    try {
      const analysis = analyzeThumbnailConcept(title, thumbnail_description, platform, content_category);
      return {
        content: [{ type: "text", text: JSON.stringify(analysis, null, 2) }],
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: `썸네일 분석 중 오류 발생: ${error}` }],
        isError: true,
      };
    }
  }
);

// =============================================================================
// Tool 14: 스크립트/대본 아웃라인 생성 (generate_script_outline) - v2.5 신규
// =============================================================================

server.tool(
  "generate_script_outline",
  "유튜브, 팟캐스트, 릴스용 스크립트 아웃라인을 자동 생성합니다.",
  {
    topic: z.string().describe("콘텐츠 주제"),
    format: z.enum(["youtube_long", "youtube_short", "podcast", "reels", "tiktok", "live"]).describe("콘텐츠 형식"),
    duration: z.string().optional().describe("예상 길이 (예: 10분, 30초)"),
    style: z.enum(["educational", "entertainment", "storytelling", "review", "tutorial", "interview", "vlog"]).optional().describe("스타일"),
    include_hooks: z.boolean().optional().describe("오프닝 훅 포함. 기본값: true"),
  },
  async ({ topic, format, duration, style = "educational", include_hooks = true }) => {
    try {
      const outline = generateScriptOutline(topic, format, duration, style, include_hooks);
      return {
        content: [{ type: "text", text: JSON.stringify(outline, null, 2) }],
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: `스크립트 생성 중 오류 발생: ${error}` }],
        isError: true,
      };
    }
  }
);

// =============================================================================
// Tool 15: 콘텐츠 리퍼포징 (repurpose_content) - v2.5 신규
// =============================================================================

server.tool(
  "repurpose_content",
  "하나의 콘텐츠를 여러 플랫폼용으로 변환하는 전략을 제안합니다.",
  {
    original_content: z.string().describe("원본 콘텐츠 (제목 또는 설명)"),
    source_platform: z.enum(["youtube", "blog", "podcast", "instagram", "newsletter"]).describe("원본 플랫폼"),
    target_platforms: z.array(z.enum(["youtube", "youtube_shorts", "instagram_post", "instagram_reels", "tiktok", "blog", "newsletter", "twitter", "threads", "linkedin"])).describe("변환할 플랫폼 목록"),
  },
  async ({ original_content, source_platform, target_platforms }) => {
    try {
      const repurposed = repurposeContent(original_content, source_platform, target_platforms);
      return {
        content: [{ type: "text", text: JSON.stringify(repurposed, null, 2) }],
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: `리퍼포징 전략 생성 중 오류 발생: ${error}` }],
        isError: true,
      };
    }
  }
);

// =============================================================================
// Tool 16: 인플루언서 콜라보 분석 (analyze_influencer_collab) - v2.5 신규
// =============================================================================

server.tool(
  "analyze_influencer_collab",
  "인플루언서 협업 전략 및 적합도를 분석합니다. 브랜드-인플루언서 매칭 가이드를 제공합니다.",
  {
    brand_category: z.string().describe("브랜드/제품 카테고리"),
    target_audience: z.string().describe("타겟 오디언스"),
    budget_range: z.enum(["low", "medium", "high", "premium"]).optional().describe("예산 범위"),
    campaign_goal: z.enum(["awareness", "engagement", "conversion", "content"]).optional().describe("캠페인 목표"),
  },
  async ({ brand_category, target_audience, budget_range = "medium", campaign_goal = "engagement" }) => {
    try {
      const analysis = analyzeInfluencerCollab(brand_category, target_audience, budget_range, campaign_goal);
      return {
        content: [{ type: "text", text: JSON.stringify(analysis, null, 2) }],
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: `인플루언서 분석 중 오류 발생: ${error}` }],
        isError: true,
      };
    }
  }
);

// =============================================================================
// Tool 17: 콘텐츠 성과 예측 (predict_content_performance) - v2.5 신규
// =============================================================================

server.tool(
  "predict_content_performance",
  "콘텐츠의 예상 성과를 AI 기반으로 예측합니다. 조회수, 참여율, 공유 가능성을 분석합니다.",
  {
    title: z.string().describe("콘텐츠 제목"),
    description: z.string().optional().describe("콘텐츠 설명"),
    platform: ContentTypeSchema.describe("플랫폼"),
    category: z.string().optional().describe("카테고리"),
    posting_time: z.string().optional().describe("게시 예정 시간 (예: 평일 저녁 7시)"),
    has_trending_topic: z.boolean().optional().describe("트렌딩 주제 포함 여부"),
  },
  async ({ title, description = "", platform, category = "일반", posting_time, has_trending_topic = false }) => {
    try {
      const prediction = predictContentPerformance(title, description, platform, category, posting_time, has_trending_topic);
      return {
        content: [{ type: "text", text: JSON.stringify(prediction, null, 2) }],
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: `성과 예측 중 오류 발생: ${error}` }],
        isError: true,
      };
    }
  }
);

// =============================================================================
// v2.5 신규 Helper Functions
// =============================================================================

// 썸네일 분석
function analyzeThumbnailConcept(title: string, description: string, platform: string, category: string): any {
  const elements = {
    face_detected: /얼굴|표정|사람|인물/.test(description),
    text_overlay: /텍스트|글자|문구/.test(description),
    bright_colors: /밝은|화려한|눈에 띄는|빨간|노란/.test(description),
    food_closeup: /음식|클로즈업|맛있/.test(description),
    before_after: /비포|애프터|전후|변화/.test(description),
    arrow_pointing: /화살표|포인팅|가리키/.test(description),
    emoji_use: /이모지|이모티콘/.test(description),
  };

  let score = 50;
  const improvements: string[] = [];
  const strengths: string[] = [];

  // 얼굴 감지 (유튜브에서 중요)
  if (elements.face_detected) {
    score += 15;
    strengths.push("얼굴/표정이 포함되어 있어 클릭률 상승 기대");
  } else {
    improvements.push("사람의 얼굴이나 표정을 추가하면 CTR 15-30% 상승");
  }

  // 텍스트 오버레이
  if (elements.text_overlay) {
    score += 10;
    strengths.push("텍스트 오버레이로 핵심 메시지 전달");
  } else {
    improvements.push("핵심 키워드 2-3개를 텍스트로 추가");
  }

  // 밝은 색상
  if (elements.bright_colors) {
    score += 8;
    strengths.push("눈에 띄는 색상 사용");
  } else {
    improvements.push("노란색, 빨간색 등 눈에 띄는 색상 활용");
  }

  // 플랫폼별 추가 점수
  if (platform === "youtube" && elements.face_detected) score += 5;
  if (platform === "instagram" && elements.bright_colors) score += 5;

  const platformBestPractices: Record<string, string[]> = {
    youtube: [
      "1280x720 이상의 해상도 사용",
      "얼굴은 프레임의 1/3 이상 차지",
      "텍스트는 3-5단어 이내",
      "대비가 강한 색상 조합",
      "호기심 자극하는 표정/포즈",
    ],
    instagram: [
      "1:1 또는 4:5 비율 권장",
      "밝고 따뜻한 톤",
      "일관된 필터/색감",
      "미니멀한 구도",
      "브랜드 컬러 활용",
    ],
    tiktok: [
      "9:16 세로 비율 필수",
      "첫 0.5초 내 시선 집중",
      "트렌디한 비주얼",
      "빠른 동작/표정",
    ],
  };

  const categoryTips: Record<string, string[]> = {
    먹방: ["음식 클로즈업 + 김 오르는 장면", "먹는 표정 강조", "양 많아 보이게"],
    뷰티: ["비포-애프터 구도", "제품 + 결과물", "깨끗한 피부 강조"],
    테크: ["제품 + 손 포함", "스펙 텍스트 오버레이", "미래지향적 느낌"],
    브이로그: ["자연스러운 표정", "장소가 드러나는 구도", "감성적 색감"],
    교육: ["핵심 포인트 텍스트", "진지한 표정", "전문가 느낌"],
  };

  return {
    title,
    platform,
    category,
    thumbnail_score: Math.min(score, 100),
    grade: score >= 85 ? "A (매우 우수)" : score >= 70 ? "B (우수)" : score >= 55 ? "C (보통)" : "D (개선 필요)",
    detected_elements: elements,
    strengths,
    improvements,
    platform_best_practices: platformBestPractices[platform] || platformBestPractices.youtube,
    category_specific_tips: categoryTips[category] || ["카테고리에 맞는 시각적 요소 강조", "타겟 오디언스가 관심 가질 요소 포함"],
    color_psychology: {
      red: "긴급함, 열정 - 할인, 긴급 콘텐츠",
      yellow: "주목, 행복 - 정보성 콘텐츠",
      blue: "신뢰, 전문성 - 교육, 테크",
      green: "건강, 자연 - 웰빙, 에코",
      orange: "에너지, 창의성 - 엔터테인먼트",
    },
    ctr_prediction: {
      current: `${score >= 70 ? "높음" : score >= 50 ? "보통" : "낮음"}`,
      potential_with_improvements: "높음 (5-10% CTR 예상)",
    },
  };
}

// 스크립트 아웃라인 생성
function generateScriptOutline(topic: string, format: string, duration: string | undefined, style: string, includeHooks: boolean): any {
  const formatSettings: Record<string, any> = {
    youtube_long: {
      recommended_duration: "8-15분",
      sections: ["인트로", "훅", "본문1", "본문2", "본문3", "정리", "CTA", "아웃트로"],
      hook_time: "0-30초",
    },
    youtube_short: {
      recommended_duration: "30-60초",
      sections: ["훅", "핵심 포인트", "CTA"],
      hook_time: "0-3초",
    },
    podcast: {
      recommended_duration: "20-45분",
      sections: ["인트로", "주제 소개", "본론1", "본론2", "질문/토론", "정리", "아웃트로"],
      hook_time: "0-60초",
    },
    reels: {
      recommended_duration: "15-30초",
      sections: ["훅", "메인 콘텐츠", "반전/CTA"],
      hook_time: "0-1초",
    },
    tiktok: {
      recommended_duration: "15-60초",
      sections: ["훅", "스토리", "포인트", "CTA"],
      hook_time: "0-1초",
    },
    live: {
      recommended_duration: "30-60분",
      sections: ["인사", "오늘의 주제", "메인 콘텐츠", "Q&A", "마무리"],
      hook_time: "0-5분",
    },
  };

  const settings = formatSettings[format] || formatSettings.youtube_long;

  const hooks = [
    `"${topic}에 대해 이런 건 몰랐을 거예요"`,
    `"오늘 알려드릴 ${topic} 팁, 진짜 중요합니다"`,
    `"${topic} 관련해서 가장 많이 받는 질문이에요"`,
    `"이거 알고 나면 ${topic}이 완전 달라집니다"`,
    `"3년간 ${topic} 하면서 깨달은 것들"`,
  ];

  const styleGuides: Record<string, any> = {
    educational: {
      tone: "전문적이지만 친근하게",
      structure: "문제 → 해결책 → 실습",
      tips: ["전문 용어는 쉽게 풀어서 설명", "실제 예시 풍부하게", "요약 정리 포함"],
    },
    entertainment: {
      tone: "활기차고 재미있게",
      structure: "훅 → 스토리 → 반전",
      tips: ["유머 포인트 삽입", "빠른 템포", "시청자 참여 유도"],
    },
    storytelling: {
      tone: "감성적이고 몰입감 있게",
      structure: "도입 → 갈등 → 해결",
      tips: ["개인적 경험 공유", "감정선 구축", "교훈으로 마무리"],
    },
    review: {
      tone: "객관적이고 솔직하게",
      structure: "소개 → 장점 → 단점 → 총평",
      tips: ["구체적 스펙/기능 언급", "비교 대상 제시", "별점/추천도"],
    },
    tutorial: {
      tone: "차분하고 명확하게",
      structure: "개요 → 단계별 설명 → 마무리",
      tips: ["화면 보며 따라할 수 있게", "실수 포인트 미리 안내", "팁 추가"],
    },
  };

  const outline: any = {
    topic,
    format,
    recommended_duration: duration || settings.recommended_duration,
    style,
    style_guide: styleGuides[style] || styleGuides.educational,
    hook_examples: includeHooks ? hooks : [],
    sections: [],
  };

  settings.sections.forEach((section: string, index: number) => {
    const sectionDetail: any = {
      order: index + 1,
      name: section,
      estimated_time: calculateSectionTime(section, format),
      key_points: [],
      script_template: "",
    };

    if (section === "인트로") {
      sectionDetail.key_points = ["채널 소개", "오늘의 주제 예고", "시청 이유 제시"];
      sectionDetail.script_template = `안녕하세요, [채널명]입니다. 오늘은 ${topic}에 대해 이야기해볼게요.`;
    } else if (section === "훅") {
      sectionDetail.key_points = ["호기심 자극", "문제 제기", "결과 미리보기"];
      sectionDetail.script_template = hooks[0];
    } else if (section.includes("본문") || section.includes("본론")) {
      sectionDetail.key_points = [`${topic}의 핵심 포인트`, "구체적 예시", "실용적 팁"];
      sectionDetail.script_template = `[핵심 내용]에 대해 자세히 설명드릴게요...`;
    } else if (section === "CTA") {
      sectionDetail.key_points = ["구독/좋아요 요청", "다음 영상 예고", "댓글 유도"];
      sectionDetail.script_template = "이 영상이 도움이 되셨다면 구독과 좋아요 부탁드려요!";
    } else if (section === "아웃트로") {
      sectionDetail.key_points = ["핵심 요약", "감사 인사", "다음 콘텐츠 예고"];
      sectionDetail.script_template = `오늘 ${topic}에 대해 알아봤는데요, 도움이 되셨길 바랍니다.`;
    }

    outline.sections.push(sectionDetail);
  });

  outline.production_tips = {
    filming: ["조명은 자연광 또는 3점 조명", "음질이 화질보다 중요", "배경 정리"],
    editing: ["점프컷으로 템포 유지", "자막 필수", "BGM 볼륨은 음성의 10-20%"],
    thumbnail: ["제목과 연계된 이미지", "얼굴 표정 강조", "텍스트 3-5단어"],
  };

  return outline;
}

function calculateSectionTime(section: string, format: string): string {
  const times: Record<string, Record<string, string>> = {
    youtube_long: {
      인트로: "30초-1분",
      훅: "30초",
      본문1: "3-4분",
      본문2: "3-4분",
      본문3: "2-3분",
      정리: "1분",
      CTA: "30초",
      아웃트로: "30초",
    },
    youtube_short: { 훅: "3초", "핵심 포인트": "20-40초", CTA: "5초" },
    reels: { 훅: "1초", "메인 콘텐츠": "20초", "반전/CTA": "5초" },
    tiktok: { 훅: "1초", 스토리: "15-30초", 포인트: "10초", CTA: "3초" },
  };

  return times[format]?.[section] || "적절히 조절";
}

// 콘텐츠 리퍼포징
function repurposeContent(original: string, source: string, targets: string[]): any {
  const repurposingStrategies: Record<string, any> = {
    youtube_shorts: {
      approach: "핵심 하이라이트 추출",
      format: "세로 9:16",
      duration: "60초 이내",
      tips: ["가장 임팩트 있는 장면 선택", "자막 필수", "훅으로 시작"],
    },
    instagram_post: {
      approach: "핵심 포인트 카드뉴스화",
      format: "1:1 또는 4:5 캐러셀",
      tips: ["10장 이내 슬라이드", "각 슬라이드 하나의 포인트", "마지막에 CTA"],
    },
    instagram_reels: {
      approach: "15-30초 하이라이트",
      format: "세로 9:16",
      tips: ["트렌딩 오디오 활용", "빠른 컷 편집", "캡션에 풀버전 링크"],
    },
    tiktok: {
      approach: "바이럴 포인트 추출",
      format: "세로 9:16, 15-60초",
      tips: ["트렌딩 사운드 필수", "첫 1초 승부", "댓글 유도형 마무리"],
    },
    blog: {
      approach: "상세 텍스트 버전 작성",
      format: "2000-3000자 글",
      tips: ["SEO 키워드 포함", "H2/H3 구조화", "이미지 5-10개"],
    },
    newsletter: {
      approach: "핵심 인사이트 요약",
      format: "800-1200자",
      tips: ["개인적인 톤", "actionable 팁", "다음 호 예고"],
    },
    twitter: {
      approach: "핵심 문장 + 스레드",
      format: "280자 × 여러 개",
      tips: ["첫 트윗이 핵심", "숫자/통계 활용", "마지막에 원본 링크"],
    },
    threads: {
      approach: "대화형 스레드",
      format: "500자 이내 × 여러 개",
      tips: ["스토리텔링 형식", "이미지 함께", "인스타 연동"],
    },
    linkedin: {
      approach: "전문적 인사이트 버전",
      format: "1000-1500자",
      tips: ["전문성 강조", "데이터/결과 중심", "업계 해시태그"],
    },
  };

  const results = targets.map(target => ({
    platform: target,
    strategy: repurposingStrategies[target] || { approach: "플랫폼에 맞게 변환", tips: [] },
    adapted_title: adaptTitleForPlatform(original, target),
    content_adjustments: getContentAdjustments(source, target),
    estimated_effort: getEffortEstimate(source, target),
    priority: getPriorityScore(target),
  }));

  return {
    original_content: original,
    source_platform: source,
    repurposing_plan: results.sort((a, b) => b.priority - a.priority),
    workflow_tip: "고품질 원본 하나로 5-7개 플랫폼 커버 가능",
    time_saving: "평균 60-70% 시간 절약",
    recommended_order: results.map(r => r.platform),
  };
}

function adaptTitleForPlatform(original: string, platform: string): string {
  const adaptations: Record<string, string> = {
    youtube_shorts: `${original} #shorts`,
    instagram_post: original.length > 50 ? original.substring(0, 47) + "..." : original,
    instagram_reels: `${original} 🔥`,
    tiktok: `${original} 알려줌`,
    twitter: original.length > 100 ? original.substring(0, 97) + "..." : original,
    threads: original,
    linkedin: `[인사이트] ${original}`,
    blog: `${original} - 완벽 가이드`,
    newsletter: `📧 ${original}`,
  };
  return adaptations[platform] || original;
}

function getContentAdjustments(source: string, target: string): string[] {
  const adjustments: string[] = [];

  if (source === "youtube" && target.includes("short")) {
    adjustments.push("긴 영상에서 핵심 15-60초 추출");
  }
  if (target === "blog") {
    adjustments.push("영상 스크립트를 글로 확장");
    adjustments.push("스크린샷 추가");
  }
  if (target.includes("instagram")) {
    adjustments.push("비주얼 중심으로 재구성");
    adjustments.push("해시태그 20-25개 추가");
  }

  return adjustments.length > 0 ? adjustments : ["플랫폼 특성에 맞게 조정"];
}

function getEffortEstimate(source: string, target: string): string {
  if (source === target) return "0분";
  if (target.includes("short") || target.includes("reels")) return "15-30분";
  if (target === "blog") return "1-2시간";
  if (target === "newsletter") return "30분-1시간";
  return "20-40분";
}

function getPriorityScore(platform: string): number {
  const scores: Record<string, number> = {
    instagram_reels: 95,
    tiktok: 90,
    youtube_shorts: 88,
    instagram_post: 80,
    twitter: 70,
    threads: 65,
    linkedin: 60,
    blog: 75,
    newsletter: 70,
  };
  return scores[platform] || 50;
}

// 인플루언서 협업 분석
function analyzeInfluencerCollab(category: string, audience: string, budget: string, goal: string): any {
  const tierInfo: Record<string, any> = {
    nano: { followers: "1K-10K", engagement: "5-10%", cost: "10-50만원", pros: ["높은 참여율", "진정성", "저비용"], cons: ["도달 제한", "전문성 부족 가능"] },
    micro: { followers: "10K-50K", engagement: "3-8%", cost: "50-200만원", pros: ["좋은 참여율", "타겟 정확", "비용 효율"], cons: ["도달 중간", "협상 필요"] },
    mid: { followers: "50K-500K", engagement: "2-5%", cost: "200-1000만원", pros: ["넓은 도달", "전문성", "콘텐츠 품질"], cons: ["비용 상승", "광고 느낌"] },
    macro: { followers: "500K-1M", engagement: "1-3%", cost: "1000-3000만원", pros: ["큰 도달", "신뢰도", "브랜드 인지도"], cons: ["높은 비용", "낮은 참여율"] },
    mega: { followers: "1M+", engagement: "1-2%", cost: "3000만원+", pros: ["최대 도달", "화제성", "브랜드 이미지"], cons: ["매우 높은 비용", "진정성 의문"] },
  };

  const budgetTiers: Record<string, string[]> = {
    low: ["nano", "micro"],
    medium: ["micro", "mid"],
    high: ["mid", "macro"],
    premium: ["macro", "mega"],
  };

  const recommendedTiers = budgetTiers[budget] || ["micro", "mid"];

  const platformsByCategory: Record<string, string[]> = {
    뷰티: ["인스타그램", "유튜브", "틱톡"],
    패션: ["인스타그램", "유튜브"],
    푸드: ["유튜브", "인스타그램", "블로그"],
    테크: ["유튜브", "블로그"],
    라이프스타일: ["인스타그램", "유튜브", "블로그"],
    게임: ["유튜브", "트위치", "틱톡"],
    육아: ["인스타그램", "블로그", "유튜브"],
    여행: ["인스타그램", "유튜브", "블로그"],
  };

  const collabTypes = [
    { type: "제품 협찬", description: "제품 제공 + 솔직 리뷰", suitable_for: ["awareness", "content"] },
    { type: "유료 광고", description: "정해진 가이드라인 콘텐츠", suitable_for: ["awareness", "conversion"] },
    { type: "어필리에이트", description: "판매 수수료 기반", suitable_for: ["conversion"] },
    { type: "앰버서더", description: "장기 파트너십", suitable_for: ["awareness", "engagement"] },
    { type: "콘텐츠 공동제작", description: "함께 기획/제작", suitable_for: ["content", "engagement"] },
  ];

  return {
    brand_category: category,
    target_audience: audience,
    budget_range: budget,
    campaign_goal: goal,
    recommended_influencer_tiers: recommendedTiers.map(tier => ({
      tier,
      ...tierInfo[tier],
    })),
    recommended_platforms: platformsByCategory[category] || ["인스타그램", "유튜브"],
    suitable_collab_types: collabTypes.filter(c => c.suitable_for.includes(goal)),
    success_metrics: {
      awareness: ["도달수", "노출수", "브랜드 검색량"],
      engagement: ["좋아요", "댓글", "저장", "공유"],
      conversion: ["클릭수", "구매수", "ROAS"],
      content: ["콘텐츠 품질", "재사용 가능성"],
    }[goal] || ["도달수", "참여율"],
    negotiation_tips: [
      "명확한 KPI 설정",
      "콘텐츠 사용권 협의",
      "수정 횟수 명시",
      "게시 일정 확정",
      "성과 리포트 요청",
    ],
    red_flags: [
      "팔로워 대비 참여율 너무 낮음 (1% 미만)",
      "댓글이 대부분 이모지나 봇성",
      "최근 콘텐츠 업로드 없음",
      "브랜드 이미지와 맞지 않는 과거 콘텐츠",
    ],
  };
}

// 콘텐츠 성과 예측
function predictContentPerformance(title: string, description: string, platform: string, category: string, postingTime: string | undefined, hasTrending: boolean): any {
  let baseScore = 50;
  const factors: any = {};

  // 제목 분석
  const titleFactors = {
    has_numbers: /\d/.test(title),
    has_question: /\?/.test(title),
    has_emotional: /놀라운|충격|비밀|최고|완벽|필수|대박|꿀팁|진짜/.test(title),
    optimal_length: title.length >= 20 && title.length <= 60,
    has_brackets: /[\[\]【】]/.test(title),
  };

  factors.title = titleFactors;
  if (titleFactors.has_numbers) baseScore += 8;
  if (titleFactors.has_question) baseScore += 5;
  if (titleFactors.has_emotional) baseScore += 10;
  if (titleFactors.optimal_length) baseScore += 5;
  if (titleFactors.has_brackets) baseScore += 3;

  // 트렌딩 토픽
  if (hasTrending) {
    baseScore += 15;
    factors.trending_boost = true;
  }

  // 게시 시간
  const timeScores: Record<string, number> = {
    "평일 아침": 60,
    "평일 점심": 75,
    "평일 저녁": 90,
    "주말 오후": 85,
    "주말 저녁": 80,
  };

  if (postingTime) {
    const timeMatch = Object.keys(timeScores).find(t => postingTime.includes(t.split(" ")[1]));
    if (timeMatch) {
      baseScore += (timeScores[timeMatch] - 50) / 5;
      factors.posting_time_score = timeScores[timeMatch];
    }
  }

  // 플랫폼별 가중치
  const platformMultiplier: Record<string, number> = {
    tiktok: 1.2,
    instagram: 1.1,
    youtube: 1.0,
    blog: 0.9,
    twitter: 0.95,
  };

  baseScore *= platformMultiplier[platform] || 1;

  const finalScore = Math.min(Math.round(baseScore), 100);

  // 예상 성과
  const performanceRanges: Record<string, any> = {
    youtube: {
      high: { views: "10K-50K", engagement: "5-8%", shares: "100-500" },
      medium: { views: "1K-10K", engagement: "3-5%", shares: "20-100" },
      low: { views: "100-1K", engagement: "1-3%", shares: "5-20" },
    },
    instagram: {
      high: { reach: "5K-20K", engagement: "6-10%", saves: "50-200" },
      medium: { reach: "1K-5K", engagement: "3-6%", saves: "10-50" },
      low: { reach: "200-1K", engagement: "1-3%", saves: "2-10" },
    },
    tiktok: {
      high: { views: "50K-500K", engagement: "8-15%", shares: "500-2K" },
      medium: { views: "5K-50K", engagement: "5-8%", shares: "50-500" },
      low: { views: "500-5K", engagement: "2-5%", shares: "10-50" },
    },
  };

  const tier = finalScore >= 75 ? "high" : finalScore >= 50 ? "medium" : "low";
  const platformPerf = performanceRanges[platform] || performanceRanges.youtube;

  return {
    title,
    platform,
    category,
    performance_score: finalScore,
    grade: finalScore >= 85 ? "A (높은 성과 예상)" : finalScore >= 70 ? "B (좋은 성과 예상)" : finalScore >= 50 ? "C (보통)" : "D (개선 필요)",
    analysis_factors: factors,
    predicted_performance: platformPerf[tier],
    confidence_level: hasTrending ? "높음 (트렌딩 반영)" : "보통",
    optimization_suggestions: [
      !titleFactors.has_numbers ? "제목에 숫자 추가 (예: 5가지, TOP 10)" : null,
      !titleFactors.has_emotional ? "감정을 자극하는 단어 추가" : null,
      !titleFactors.optimal_length ? "제목 길이 20-60자 권장" : null,
      !hasTrending ? "트렌딩 키워드 연계 고려" : null,
    ].filter(Boolean),
    best_posting_windows: {
      weekday: "오전 7-9시, 점심 12-1시, 저녁 7-10시",
      weekend: "오후 2-4시, 저녁 7-9시",
    },
  };
}

// =============================================================================
// Server Start
// =============================================================================

async function main() {
  const isHttpMode = process.env.MCP_HTTP_MODE === 'true' || process.argv.includes('--http');
  const port = parseInt(process.env.PORT || '3000', 10);

  if (isHttpMode) {
    // HTTP/SSE 모드 (PlayMCP, 웹 클라이언트용)
    console.log(`Starting Content Genie MCP Server v2.9.0 in HTTP mode on port ${port}...`);

    const app = express();
    app.use(cors());
    app.use(express.json());

    // 도구 목록 (PlayMCP 연결 확인용)
    const toolsList = [
      { name: "get_korean_trends", description: "다음/네이버 실시간 트렌드 조회" },
      { name: "analyze_news_trends", description: "뉴스 트렌드 분석" },
      { name: "get_seasonal_content_guide", description: "시즌 콘텐츠 가이드" },
      { name: "analyze_seo_keywords", description: "SEO 키워드 심층 분석" },
      { name: "generate_hashtag_strategy", description: "해시태그 전략 생성" },
      { name: "analyze_competitor_content", description: "경쟁사 콘텐츠 분석" },
      { name: "generate_content_ideas", description: "콘텐츠 아이디어 생성" },
      { name: "optimize_title_hashtags", description: "제목/해시태그 최적화" },
      { name: "create_content_calendar", description: "콘텐츠 캘린더 생성" },
      { name: "generate_script_outline", description: "스크립트 아웃라인 생성" },
      { name: "repurpose_content", description: "콘텐츠 리퍼포징" },
      { name: "predict_viral_score", description: "바이럴 점수 예측" },
      { name: "benchmark_content_performance", description: "성과 벤치마크" },
      { name: "predict_content_performance", description: "콘텐츠 성과 예측" },
      { name: "analyze_thumbnail", description: "썸네일 분석" },
      { name: "generate_ab_test_variants", description: "A/B 테스트 변형 생성" },
      { name: "analyze_influencer_collab", description: "인플루언서 협업 분석" },
    ];

    // Health check
    app.get('/', (_req: Request, res: Response) => {
      res.json({
        status: 'ok',
        server: 'content-genie-mcp',
        version: '2.9.3',
        tools: 17,
        timestamp: new Date().toISOString()
      });
    });

    app.get('/health', (_req: Request, res: Response) => {
      res.json({
        status: 'ok',
        server: 'content-genie-mcp',
        version: '2.9.3',
        tools: 17,
        timestamp: new Date().toISOString()
      });
    });

    // MCP 엔드포인트 - PlayMCP 연결 확인용 (간단한 응답)
    app.post('/mcp', (req: Request, res: Response) => {
      const { method, id } = req.body;

      // initialize 요청에 대한 응답
      if (method === 'initialize') {
        res.json({
          jsonrpc: '2.0',
          id,
          result: {
            protocolVersion: '2024-11-05',
            capabilities: { tools: { listChanged: true } },
            serverInfo: { name: 'content-genie-mcp', version: '2.9.3' }
          }
        });
        return;
      }

      // tools/list 요청에 대한 응답
      if (method === 'tools/list') {
        res.json({
          jsonrpc: '2.0',
          id,
          result: { tools: toolsList }
        });
        return;
      }

      // 기타 요청
      res.json({
        jsonrpc: '2.0',
        id,
        error: { code: -32601, message: 'Method not found' }
      });
    });

    // SSE endpoint for MCP connection (MCP Inspector용)
    const transports = new Map<string, SSEServerTransport>();

    app.get('/sse', async (_req: Request, res: Response) => {
      console.log('New SSE connection established');

      const transport = new SSEServerTransport('/message', res);
      const sessionId = crypto.randomUUID();
      transports.set(sessionId, transport);

      res.on('close', () => {
        console.log('SSE connection closed');
        transports.delete(sessionId);
      });

      await server.connect(transport);
    });

    // Message endpoint for MCP communication
    app.post('/message', async (req: Request, res: Response) => {
      const sessionId = req.query.sessionId as string;

      if (!sessionId) {
        const transport = Array.from(transports.values())[0];
        if (transport) {
          await transport.handlePostMessage(req, res);
        } else {
          res.status(400).json({ error: 'No active session' });
        }
        return;
      }

      const transport = transports.get(sessionId);
      if (transport) {
        await transport.handlePostMessage(req, res);
      } else {
        res.status(404).json({ error: 'Session not found' });
      }
    });

    app.listen(port, () => {
      console.log(`Content Genie MCP Server v2.9.0 running on HTTP port ${port}`);
      console.log(`Health check: http://localhost:${port}/health`);
      console.log(`MCP endpoint: http://localhost:${port}/mcp`);
      console.log(`SSE endpoint: http://localhost:${port}/sse`);
    });
  } else {
    // stdio 모드 (Claude Desktop, Claude Code용)
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("Content Genie MCP Server v2.9.0 running on stdio");
  }
}

main().catch(console.error);

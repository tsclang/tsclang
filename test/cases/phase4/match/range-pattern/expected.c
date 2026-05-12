#include "runtime.h"

int main(void) {
    TSC_INIT();
    const int32_t score = 75;
    String grade;
    if (score >= 90 && score <= 100) { grade = STR_LIT("A"); }
    else if (score >= 70 && score <= 89) { grade = STR_LIT("B"); }
    else if (score >= 50 && score <= 69) { grade = STR_LIT("C"); }
    else { grade = STR_LIT("F"); }
    printf("%s\n", grade.data);
    return 0;
}

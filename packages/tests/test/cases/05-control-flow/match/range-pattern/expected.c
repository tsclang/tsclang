#include "runtime.h"

int main(void) {
    TSC_INIT();
    const int32_t score = 75;
    String grade = {0};
    if (score >= 90 && score < 101) { grade = STR_LIT("A"); }
    else if (score >= 70 && score < 90) { grade = STR_LIT("B"); }
    else if (score >= 50 && score < 70) { grade = STR_LIT("C"); }
    else { grade = STR_LIT("F"); }
    printf("%s\n", grade.data);
    return 0;
}

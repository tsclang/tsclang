#include "runtime.h"

int main(void) {
    TSC_INIT();
    const int32_t n = 2;
    String s;
    if (n == 1 || n == 2 || n == 3) { s = STR_LIT("low"); }
    else { s = STR_LIT("high"); }
    printf("%s\n", s.data);
    return 0;
}

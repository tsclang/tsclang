#include "runtime.h"

int main(void) {
    TSC_INIT();
    char a = 97U;
    char b = 98U;
    char r1 = a & b;
    char r2 = ~a;
    printf("%c\n", r1);
    printf("%c\n", r2);
    return 0;
}

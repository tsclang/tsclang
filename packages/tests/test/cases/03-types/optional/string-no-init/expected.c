#include "runtime.h"

int main(void) {
    TSC_INIT();
    String s = STR_LIT("");
    printf("%s\n", s.data);
    return 0;
}

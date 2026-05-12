#include "runtime.h"

int main(void) {
    TSC_INIT();
    bool found = false;
    int32_t i = 0;
    while (i < 3) {
        int32_t j = 0;
        while (j < 3) {
            if (i == 1 && j == 1) {
                found = true;
                goto outer_break;
            }
            j++;
        }
        i++;
    }
    outer_break:;
    printf("%s\n", (found) ? "true" : "false");
    return 0;
}

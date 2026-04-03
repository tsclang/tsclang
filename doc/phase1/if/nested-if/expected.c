#include "runtime.h"

int main(void) {
    TSC_INIT();
    if (true) {
        if (false) {
            printf("inner-then\n");
        } else {
            printf("inner-else\n");
        }
    }
    return 0;
}
